/// <reference types="vite/client" />
declare module "*.wasm?module" {
  const m: WebAssembly.Module;
  export default m;
}
