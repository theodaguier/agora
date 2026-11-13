// Mammoth's standalone browser build: the same API as the package, without Node's modules.
declare module "mammoth/mammoth.browser.js" {
  import mammoth from "mammoth";
  export default mammoth;
}
