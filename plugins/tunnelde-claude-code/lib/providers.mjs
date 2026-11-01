import { randomUUID } from "node:crypto";
import { endpoint } from "./config.mjs";

const MAX_EVENT = 1024 * 1024;
const MAX_RESPONSE = 4 * 1024 * 1024;
const MAX_ARGUMENTS = 96 * 1024;
const parseArgs = (text) => {
  if (Buffer.byteLength(text ?? "") > MAX_ARGUMENTS)
    throw new Error("Tool arguments exceed the supported size");
  const value = JSON.parse(text || "{}");
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Tool arguments must be an object");
  return value;
};

/** SSE parser handles UTF-8, split CRLF frames, comments and multi-line data. */
export async function* parseSse(body, signal) {
  if (!body) throw new Error("Model server returned an empty response body");
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "",
    total = 0;
  const cancel = () => {
    void reader.cancel(signal?.reason).catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      if (value) {
        total += value.byteLength;
        if (total > MAX_RESPONSE) throw new Error("Model response exceeds 4 MiB");
        buffer += decoder.decode(value, { stream: true });
      }
      if (done) buffer += decoder.decode();
      let boundary;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        if (Buffer.byteLength(frame) > MAX_EVENT) throw new Error("Model event exceeds 1 MiB");
        const lines = frame.split(/\r?\n/);
        const data = lines
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).replace(/^ /, ""))
          .join("\n");
        const event =
          lines
            .find((line) => line.startsWith("event:"))
            ?.slice(6)
            .trim() ?? "message";
        if (data) yield { event, data };
      }
      if (Buffer.byteLength(buffer) > MAX_EVENT) throw new Error("Model event exceeds 1 MiB");
      if (done) {
        if (buffer.trim()) throw new Error("Model stream ended in an incomplete SSE frame");
        break;
      }
    }
    signal?.throwIfAborted();
  } finally {
    signal?.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function openaiMessages(messages) {
  return messages.map((message) => {
    if (message.role === "tool")
      return {
        role: "tool",
        tool_call_id: message.toolCallId ?? message.toolId,
        content: message.content,
      };
    return {
      role: message.role,
      content: message.content || null,
      ...(message.toolCalls?.length
        ? {
            tool_calls: message.toolCalls.map((tool) => ({
              id: tool.id,
              type: "function",
              function: { name: tool.name, arguments: JSON.stringify(tool.arguments) },
            })),
          }
        : {}),
    };
  });
}
function responsesInput(messages) {
  const result = [];
  for (const message of messages) {
    if (message.role === "tool")
      result.push({
        type: "function_call_output",
        call_id: message.toolCallId ?? message.toolId,
        output: message.content,
      });
    else {
      if (message.content) result.push({ role: message.role, content: message.content });
      for (const tool of message.toolCalls ?? [])
        result.push({
          type: "function_call",
          call_id: tool.id,
          name: tool.name,
          arguments: JSON.stringify(tool.arguments),
        });
    }
  }
  return result;
}
function anthropicMessages(messages) {
  const result = [];
  for (const message of messages.filter((item) => item.role !== "system")) {
    if (message.role === "tool")
      result.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: message.toolCallId ?? message.toolId,
            content: message.content,
          },
        ],
      });
    else
      result.push({
        role: message.role,
        content: [
          ...(message.content ? [{ type: "text", text: message.content }] : []),
          ...(message.toolCalls ?? []).map((tool) => ({
            type: "tool_use",
            id: tool.id,
            name: tool.name,
            input: tool.arguments,
          })),
        ],
      });
  }
  return result;
}
function geminiContents(messages) {
  const result = [];
  for (const message of messages.filter((item) => item.role !== "system")) {
    if (message.role === "tool")
      result.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              id: message.toolCallId ?? message.toolId,
              name: message.name,
              response: { result: message.content },
            },
          },
        ],
      });
    else
      result.push({
        role: message.role === "assistant" ? "model" : "user",
        parts: [
          ...(message.content ? [{ text: message.content }] : []),
          ...(message.toolCalls ?? []).map(
            (tool) =>
              tool.raw ?? { functionCall: { id: tool.id, name: tool.name, args: tool.arguments } },
          ),
        ],
      });
  }
  return result;
}

export function buildProviderRequest(profile, apiKey, messages, tools = []) {
  const base = endpoint(profile.baseUrl);
  const common = { model: profile.model, stream: true };
  const headers = { "content-type": "application/json", accept: "text/event-stream" };
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  let url, body;
  switch (profile.protocol) {
    case "openai-chat":
      url = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
      if (apiKey) headers.authorization = `Bearer ${apiKey}`;
      body = {
        ...common,
        messages: openaiMessages(messages),
        ...(tools.length
          ? { tools: tools.map((tool) => ({ type: "function", function: tool })) }
          : {}),
      };
      break;
    case "openai-responses":
      url = base.endsWith("/responses") ? base : `${base}/responses`;
      if (apiKey) headers.authorization = `Bearer ${apiKey}`;
      body = {
        ...common,
        store: false,
        input: responsesInput(messages),
        ...(tools.length
          ? { tools: tools.map((tool) => ({ type: "function", ...tool, strict: false })) }
          : {}),
      };
      break;
    case "anthropic":
      url = base.endsWith("/messages") ? base : `${base}/messages`;
      headers["anthropic-version"] = "2023-06-01";
      if (apiKey) headers["x-api-key"] = apiKey;
      body = {
        ...common,
        max_tokens: 8192,
        system,
        messages: anthropicMessages(messages),
        ...(tools.length
          ? {
              tools: tools.map(({ name, description, parameters }) => ({
                name,
                description,
                input_schema: parameters,
              })),
            }
          : {}),
      };
      break;
    case "gemini":
      url = `${base}/models/${encodeURIComponent(profile.model)}:streamGenerateContent?alt=sse`;
      if (apiKey) headers["x-goog-api-key"] = apiKey;
      body = {
        contents: geminiContents(messages),
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        ...(tools.length
          ? {
              tools: [
                {
                  functionDeclarations: tools.map(({ name, description, parameters }) => ({
                    name,
                    description,
                    parametersJsonSchema: parameters,
                  })),
                },
              ],
            }
          : {}),
      };
      break;
    default:
      throw new Error("This profile does not support HTTP model requests");
  }
  return { url, headers, body };
}

export async function streamCompletion({
  profile,
  apiKey,
  messages,
  tools = [],
  signal,
  onDelta = () => {},
  fetchImpl = fetch,
}) {
  const request = buildProviderRequest(profile, apiKey, messages, tools);
  const combined = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(300_000)]);
  const response = await fetchImpl(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(request.body),
    signal: combined,
    redirect: "error",
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      `Model request failed (HTTP ${response.status}); check provider URL, authentication and model access`,
    );
  }
  const calls = new Map();
  let text = "",
    complete = false,
    usage = null;
  const append = (delta) => {
    if (typeof delta !== "string" || !delta) return;
    text += delta;
    if (Buffer.byteLength(text) > 1024 * 1024) throw new Error("Assistant output exceeds 1 MiB");
    onDelta(delta);
  };
  for await (const frame of parseSse(response.body, combined)) {
    if (frame.data === "[DONE]") {
      if (!complete) throw new Error("Model sent DONE before a completed turn");
      continue;
    }
    const data = JSON.parse(frame.data);
    if (data.error || data.type === "error")
      throw new Error("Model service reported a stream error");
    switch (profile.protocol) {
      case "openai-chat": {
        const choice = data.choices?.find((item) => item.index === 0) ?? data.choices?.[0];
        append(choice?.delta?.content);
        for (const delta of choice?.delta?.tool_calls ?? []) {
          const key = delta.index ?? 0;
          const call = calls.get(key) ?? { id: delta.id || randomUUID(), name: "", input: "" };
          if (delta.id) call.id = delta.id;
          if (delta.function?.name) call.name += delta.function.name;
          call.input += delta.function?.arguments ?? "";
          if (call.input.length > MAX_ARGUMENTS)
            throw new Error("Tool arguments exceed the supported size");
          calls.set(key, call);
        }
        if (choice?.finish_reason) {
          if (!["stop", "tool_calls", "function_call"].includes(choice.finish_reason))
            throw new Error(`Model turn did not finish: ${choice.finish_reason}`);
          complete = true;
        }
        usage = data.usage ?? usage;
        break;
      }
      case "openai-responses": {
        if (data.type === "response.output_text.delta") append(data.delta);
        if (data.type === "response.output_item.added" && data.item?.type === "function_call")
          calls.set(data.output_index, {
            id: data.item.call_id,
            name: data.item.name,
            input: data.item.arguments ?? "",
          });
        if (data.type === "response.function_call_arguments.delta") {
          const call = calls.get(data.output_index);
          if (!call) throw new Error("Function arguments arrived before the call definition");
          call.input += data.delta ?? "";
          if (call.input.length > MAX_ARGUMENTS)
            throw new Error("Tool arguments exceed the supported size");
        }
        if (["response.failed", "response.incomplete"].includes(data.type))
          throw new Error("Model response was incomplete");
        if (data.type === "response.completed") {
          if (data.response?.status && data.response.status !== "completed")
            throw new Error("Model response was incomplete");
          complete = true;
          usage = data.response?.usage ?? null;
          for (const [index, item] of (data.response?.output ?? []).entries()) {
            if (item.type === "function_call")
              calls.set(index, {
                id: item.call_id,
                name: item.name,
                input: item.arguments ?? "{}",
              });
          }
        }
        break;
      }
      case "anthropic": {
        if (data.type === "content_block_start" && data.content_block?.type === "tool_use")
          calls.set(data.index, {
            id: data.content_block.id,
            name: data.content_block.name,
            input: "",
            initial: data.content_block.input,
          });
        if (data.type === "content_block_delta") {
          if (data.delta?.type === "text_delta") append(data.delta.text);
          if (data.delta?.type === "input_json_delta") {
            const call = calls.get(data.index);
            if (!call) throw new Error("Tool input arrived before the tool definition");
            call.input += data.delta.partial_json;
            if (call.input.length > MAX_ARGUMENTS)
              throw new Error("Tool arguments exceed the supported size");
          }
        }
        if (
          data.type === "message_delta" &&
          ["max_tokens", "refusal"].includes(data.delta?.stop_reason)
        )
          throw new Error("Model response was truncated or refused");
        if (data.type === "message_stop") complete = true;
        usage = data.usage ?? data.message?.usage ?? usage;
        break;
      }
      case "gemini": {
        if (data.promptFeedback?.blockReason) throw new Error("Gemini blocked the request");
        const candidate = data.candidates?.[0];
        for (const part of candidate?.content?.parts ?? []) {
          if (!part.thought) append(part.text);
          if (part.functionCall) {
            const { name, args, id } = part.functionCall;
            const callId = id || randomUUID();
            calls.set(callId, { id: callId, name, input: JSON.stringify(args ?? {}), raw: part });
          }
        }
        if (candidate?.finishReason) {
          if (candidate.finishReason !== "STOP")
            throw new Error(`Gemini turn did not finish: ${candidate.finishReason}`);
          complete = true;
        }
        usage = data.usageMetadata ?? usage;
        break;
      }
    }
    if (calls.size > 32) throw new Error("Too many tool calls in one model turn");
  }
  if (!complete) throw new Error("Model stream disconnected before the turn completed");
  return {
    text,
    calls: [...calls.values()].map((call) => ({
      id: call.id,
      name: call.name,
      arguments: call.input ? parseArgs(call.input) : (call.initial ?? {}),
      ...(call.raw ? { raw: call.raw } : {}),
    })),
    usage,
  };
}
