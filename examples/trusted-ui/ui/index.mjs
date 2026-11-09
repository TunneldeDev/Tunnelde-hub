/** @param {import('../../../sdk/tunnelde-ui.mjs').FrontendContext} context */
export function activate(context) {
  const React = context.sdk.react;
  const { Button, Field, Input } = context.sdk.components;
  function View() {
    const [name, setName] = React.useState("");
    const [count, setCount] = React.useState(0);
    const inputId = React.useId();
    return React.createElement("section", { "aria-label": "UI example" },
      React.createElement(Field, { label: "Name", htmlFor: inputId },
        React.createElement(Input, { id: inputId, value: name, onChange: event => setName(event.target.value) })),
      React.createElement(Button, { onClick: () => setCount(value => value + 1) },
        `${name || "Hello"}: ${count}`));
  }
  context.views.register("main", View);
  context.commands.register("hello", () => ({ text: "Hello from the shared UI runtime" }));
}
