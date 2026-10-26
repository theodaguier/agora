import { afterAll, afterEach, expect, test } from "bun:test";
import { PreviewUrls } from "../src/lib/preview-urls";

const create = URL.createObjectURL;
const revoke = URL.revokeObjectURL;
let sequence = 0;
const released: string[] = [];
URL.createObjectURL = () => `blob:test-${sequence++}`;
URL.revokeObjectURL = (url) => { released.push(url); };
afterEach(() => { released.length = 0; });
afterAll(() => { URL.createObjectURL = create; URL.revokeObjectURL = revoke; });

test("a sent image remains alive until the pending message has finished using it", () => {
  const composer = new PreviewUrls(), message = new PreviewUrls();
  const url = composer.create(new Blob(["image"]));
  message.adopt(url);
  composer.clear();
  expect(released).toEqual([]);
  message.keep([]);
  expect(released).toEqual([url]);
  message.clear();
  expect(released).toEqual([url]);
});
test("discarding files or unmounting releases every preview exactly once", () => {
  const owner = new PreviewUrls();
  const a = owner.create(new Blob()), b = owner.create(new Blob());
  owner.remove(a); owner.clear(); owner.clear();
  expect(released).toEqual([a, b]);
});
test("shared pending previews are kept until every owner releases them", () => {
  const source = new PreviewUrls(), a = new PreviewUrls(), b = new PreviewUrls();
  const url = source.create(new Blob());
  a.adopt(url); a.adopt(url); b.adopt(url);
  source.clear(); a.clear();
  expect(released).toEqual([]);
  b.clear();
  expect(released).toEqual([url]);
});
test("foreign URLs are never adopted or revoked", () => {
  const owner = new PreviewUrls();
  owner.adopt("blob:foreign"); owner.clear();
  expect(released).toEqual([]);
});
