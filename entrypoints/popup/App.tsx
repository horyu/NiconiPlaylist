import { createSignal } from "solid-js";

import solidLogo from "@/assets/solid.svg";

import "./App.css";

function App() {
  const [count, setCount] = createSignal(0);

  return (
    <>
      <div>
        <a href="https://solidjs.com" target="_blank">
          <img src={solidLogo} class="logo solid" alt="Solid logo" />
        </a>
      </div>
      <h1>WXT + Solid</h1>
      <div class="card">
        <button onClick={() => setCount((count) => count + 1)}>count is {count()}</button>
        <p>
          Edit <code>popup/App.tsx</code> and save to test HMR
        </p>
      </div>
    </>
  );
}

export default App;
