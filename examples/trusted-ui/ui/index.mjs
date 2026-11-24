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
  function Workbench({ workbench }) {
    const { Workspace, Navigation, Inspector, StatusBar } = workbench;
    return React.createElement("div", {
      style: { display: "flex", flex: 1, flexDirection: "column", minHeight: 0 },
    }, React.createElement("div", {
      style: { display: "flex", flex: 1, minHeight: 0 },
    }, React.createElement(Workspace), React.createElement(Navigation), React.createElement(Inspector)),
    React.createElement(StatusBar));
  }
  context.views.register("desktop", Workbench);
  function Files({ fileBrowser }) {
    const { snapshot, Entries } = fileBrowser;
    return React.createElement("section", {
      style: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 },
    }, React.createElement(Button, {
      disabled: snapshot.busy || !snapshot.path,
      onClick: () => fileBrowser.refresh(),
    }, `Refresh · ${snapshot.total}`), React.createElement(Entries));
  }
  context.views.register("files", Files);
  context.commands.register("hello", () => ({ text: "Hello from the shared UI runtime" }));
  context.commands.register("inspect-host", ({ host }) => ({ text: `${host.name}: ${host.address}:${host.port}` }));
}
