import { z } from "zod";
export async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  const r = await fetch(
    "/api" + path,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Request failed");
  return schema.parse(data);
}
export async function stream<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
  progress: (s: string) => void,
): Promise<T> {
  const r = await fetch("/api" + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json()).error ?? "Request failed");
  const reader = r.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: T | undefined;
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let split;
    while ((split = buffer.indexOf("\n\n")) >= 0) {
      const event = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      const kind = event.match(/^event: (.+)$/m)?.[1];
      const raw = event.match(/^data: (.+)$/m)?.[1];
      if (!raw) continue;
      const data = JSON.parse(raw);
      if (kind === "error") throw new Error(data.error);
      if (kind === "progress")
        progress(z.object({ text: z.string() }).parse(data).text);
      if (kind === "result") result = schema.parse(data);
    }
    if (done) break;
  }
  if (!result)
    throw new Error("Connection ended before the analysis completed.");
  return result;
}
