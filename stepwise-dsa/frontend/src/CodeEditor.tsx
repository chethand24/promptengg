import { useEffect, useRef } from "react";
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import TSWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
self.MonacoEnvironment = {
  getWorker: (_id, label) =>
    label === "typescript" || label === "javascript"
      ? new TSWorker()
      : new EditorWorker(),
};
loader.config({ monaco });
export default function CodeEditor({
  value,
  onChange,
  language,
  dark,
  lines,
  readOnly = false,
}: {
  value: string;
  onChange?: (s: string) => void;
  language: string;
  dark: boolean;
  lines?: [number, number];
  readOnly?: boolean;
}) {
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decoration = useRef<monaco.editor.IEditorDecorationsCollection | null>(
    null,
  );
  const mount: OnMount = (e) => {
    editor.current = e;
    decoration.current = e.createDecorationsCollection();
  };
  useEffect(() => {
    decoration.current?.set(
      lines
        ? [
            {
              range: new monaco.Range(lines[0], 1, lines[1], 1),
              options: { isWholeLine: true, className: "code-highlight" },
            },
          ]
        : [],
    );
    if (lines) editor.current?.revealLineInCenter(lines[0]);
  }, [lines]);
  return (
    <Editor
      height="360px"
      language={language}
      value={value}
      theme={dark ? "vs-dark" : "vs"}
      onChange={(s) => onChange?.(s ?? "")}
      onMount={mount}
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 14,
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        padding: { top: 16 },
        automaticLayout: true,
        wordWrap: "on",
        ariaLabel: readOnly ? "Annotated solution code" : "Solution code",
      }}
    />
  );
}
