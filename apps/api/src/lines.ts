/** The non-empty lines of a process's output, as they arrive (JSONL streams of the CLI engines). */
export async function* readLines(stream: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let end: number;
    while ((end = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (line) yield line;
    }
  }
  if (buffer.trim()) yield buffer.trim();
}
