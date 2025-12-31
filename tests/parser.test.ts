import { describe, expect, it } from "vitest";
import { parseCSVRecords } from "../src/parser";

describe("parseCSVRecords", () => {
  it("parses quoted multiline fields", () => {
    const csv = 'id,content\n1,"hello\nworld"';
    expect(parseCSVRecords(csv)).toEqual([
      ["id", "content"],
      ["1", "hello\nworld"],
    ]);
  });

  it('unescapes doubled quotes inside quoted fields', () => {
    const csv = 'id,content\n1,"a""b"';
    expect(parseCSVRecords(csv)).toEqual([
      ["id", "content"],
      ["1", 'a"b'],
    ]);
  });

  it("handles BOM and trailing newline", () => {
    const csv = "\uFEFFid,name\n1,Alice\n";
    expect(parseCSVRecords(csv)).toEqual([
      ["id", "name"],
      ["1", "Alice"],
    ]);
  });

  it("handles CRLF line endings", () => {
    const csv = "id,name\r\n1,Alice\r\n2,Bob\r\n";
    expect(parseCSVRecords(csv)).toEqual([
      ["id", "name"],
      ["1", "Alice"],
      ["2", "Bob"],
    ]);
  });
});
