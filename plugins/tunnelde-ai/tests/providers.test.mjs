import test from "node:test";
import assert from "node:assert/strict";
import { buildProviderRequest, parseSse, streamCompletion } from "../lib/providers.mjs";

const profile = (protocol) => ({
  protocol,
  model: "test-model",
  baseUrl: "https://example.com/v1",
});
function response(records) {
  const bytes = new TextEncoder().encode(
    records
      .map((item) => `data: ${typeof item === "string" ? item : JSON.stringify(item)}\r\n\r\n`)
      .join(""),
  );
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
        controller.close();
      },
    }),
  );
}
const scenarios = {
  "openai-chat": [
    {
      choices: [
        {
          index: 0,
          delta: {
            content: "你好",
            tool_calls: [
              { index: 0, id: "call-1", function: { name: "read_file", arguments: '{"path":' } },
            ],
          },
        },
      ],
    },
    {
      choices: [
        {
          index: 0,
          delta: { tool_calls: [{ index: 0, function: { arguments: '"/work/a"}' } }] },
          finish_reason: "tool_calls",
        },
      ],
    },
    "[DONE]",
  ],
  "openai-responses": [
    { type: "response.output_text.delta", delta: "你好" },
    {
      type: "response.output_item.added",
      output_index: 0,
      item: { type: "function_call", call_id: "call-1", name: "read_file", arguments: "" },
    },
    {
      type: "response.function_call_arguments.delta",
      output_index: 0,
      delta: '{"path":"/work/a"}',
    },
    { type: "response.completed", response: { status: "completed" } },
  ],
  anthropic: [
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "你好" } },
    {
      type: "content_block_start",
      index: 1,
      content_block: { type: "tool_use", id: "call-1", name: "read_file", input: {} },
    },
    {
      type: "content_block_delta",
      index: 1,
      delta: { type: "input_json_delta", partial_json: '{"path":"/work/a"}' },
    },
    { type: "message_stop" },
  ],
  gemini: [
    {
      candidates: [
        {
          content: {
            parts: [
              { text: "你好" },
              {
                thoughtSignature: "signature",
                functionCall: { id: "call-1", name: "read_file", args: { path: "/work/a" } },
              },
            ],
          },
          finishReason: "STOP",
        },
      ],
    },
  ],
};
for (const [protocol, records] of Object.entries(scenarios)) {
  test(`${protocol}: fragmented UTF-8 streaming and structured tool history`, async () => {
    let delta = "";
    const result = await streamCompletion({
      profile: profile(protocol),
      messages: [],
      fetchImpl: async () => response(records),
      onDelta: (value) => {
        delta += value;
      },
    });
    assert.equal(result.text, "你好");
    assert.equal(delta, "你好");
    assert.equal(result.calls.length, 1);
    assert.deepEqual(result.calls[0].arguments, { path: "/work/a" });
    const request = buildProviderRequest(profile(protocol), "secret", [
      { role: "assistant", content: "", toolCalls: result.calls },
      { role: "tool", toolCallId: "call-1", name: "read_file", content: "result" },
    ]);
    assert.match(JSON.stringify(request.body), /call-1/);
    assert.ok(!JSON.stringify(request.body).includes("secret"));
    if (protocol === "gemini") assert.match(JSON.stringify(request.body), /signature/);
  });
  test(`${protocol}: truncated turn is rejected before tools execute`, async () => {
    await assert.rejects(
      streamCompletion({
        profile: profile(protocol),
        messages: [],
        fetchImpl: async () => response(records.slice(0, protocol === "openai-chat" ? -2 : -1)),
      }),
      /disconnected|complete/,
    );
  });
}
test("Chat DONE without finish reason cannot authorize a tool", async () => {
  await assert.rejects(
    streamCompletion({
      profile: profile("openai-chat"),
      messages: [],
      fetchImpl: async () => response([scenarios["openai-chat"][0], "[DONE]"]),
    }),
    /before a completed/,
  );
});
test("truncated SSE frames and HTTP failures are explicit", async () => {
  await assert.rejects(async () => {
    for await (const _ of parseSse(new Response("data: {}").body)) {
    }
  }, /incomplete SSE/);
  await assert.rejects(
    streamCompletion({
      profile: profile("anthropic"),
      messages: [],
      fetchImpl: async () => new Response("secret server body", { status: 401 }),
    }),
    /HTTP 401/,
  );
});
test("model length truncation rejects partial calls", async () => {
  await assert.rejects(
    streamCompletion({
      profile: profile("openai-chat"),
      messages: [],
      fetchImpl: async () => response([{ choices: [{ delta: {}, finish_reason: "length" }] }]),
    }),
    /did not finish/,
  );
});
