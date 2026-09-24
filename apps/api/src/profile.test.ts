import { expect, test } from "bun:test";
import { profileInput } from "./profile";

const base = { firstName: " Théo ", lastName: "Daguier", title: "Développeur", username: "theo" };

test("first name, last name, role and username are required", () => {
  expect(profileInput.safeParse({ ...base, title: "  " }).success).toBe(false);
  expect(profileInput.safeParse({ ...base, username: "" }).success).toBe(false);
  const { username: _, ...noUsername } = base;
  expect(profileInput.safeParse(noUsername).success).toBe(false);
  expect(profileInput.parse(base).firstName).toBe("Théo");
});

test("username is lowercased, with restricted characters", () => {
  expect(profileInput.parse({ ...base, username: " Theo.D " }).username).toBe("theo.d");
  const bad = profileInput.safeParse({ ...base, username: "théo d" });
  expect(bad.success).toBe(false);
  expect(bad.error?.issues[0]?.message).toBe("username_invalid");
});

test("bio stays optional", () => {
  expect(profileInput.parse(base).bio).toBeUndefined();
});
