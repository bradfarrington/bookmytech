import { describe, expect, it } from "vitest";
import { passwordStrength } from "./password-strength";

describe("passwordStrength", () => {
  it("is empty for an empty password", () => {
    expect(passwordStrength("")).toEqual({ score: 0, hint: "Use at least 8 characters." });
  });

  it("asks for the minimum length before anything else", () => {
    expect(passwordStrength("Ab1!")).toEqual({ score: 1, hint: "Use at least 8 characters." });
  });

  it("uses the minimum it's given", () => {
    expect(passwordStrength("Zq8!mvkp", 10).hint).toBe("Use at least 10 characters.");
  });

  it("flags common passwords, ignoring case", () => {
    expect(passwordStrength("Password1")).toEqual({ score: 1, hint: "That one's too easy to guess." });
    expect(passwordStrength("12345678").score).toBe(1);
  });

  it("flags repeats and runs", () => {
    expect(passwordStrength("aaaaaaaa").hint).toBe("That one's too easy to guess.");
    expect(passwordStrength("xyzxyzxyz").hint).toBe("That one's too easy to guess.");
    expect(passwordStrength("abcdefghij").hint).toBe("That one's too easy to guess.");
    expect(passwordStrength("98765432").hint).toBe("That one's too easy to guess.");
  });

  it("scores an eight-letter password as weak", () => {
    expect(passwordStrength("zqxwvjkp")).toEqual({
      score: 1,
      hint: "Weak. Add more characters, numbers or symbols.",
    });
  });

  it("rewards variety", () => {
    expect(passwordStrength("zqxwvjk7").score).toBe(2);
    expect(passwordStrength("Zqxwvjk7").score).toBe(3);
  });

  it("rewards length", () => {
    expect(passwordStrength("zqxwvjkpmnbv").score).toBe(2);
    expect(passwordStrength("Zqxwvjk7mnbv")).toEqual({ score: 4, hint: "Looking strong." });
  });

  it("treats a long passphrase as strong", () => {
    expect(passwordStrength("correct horse battery staple").score).toBe(4);
  });

  it("never scores above 4", () => {
    expect(passwordStrength("Zq8!mvkp#Lw2@rtY$u9%").score).toBe(4);
  });
});
