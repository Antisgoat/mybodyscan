import type { ReactNode } from "react";

function simpleMarkdownToNodes(markdown: string): ReactNode {
  const lines = markdown.split(/\r?\n/);
  const nodes: ReactNode[] = [];
  const listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    nodes.push(
      <ul className="list-disc pl-5" key={`list-${nodes.length}`}>
        {listItems.splice(0, listItems.length).map((text, index) => (
          <li key={index}>{text}</li>
        ))}
      </ul>
    );
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }
    if (line.startsWith("# ")) {
      flushList();
      nodes.push(
        <h1 key={`h1-${nodes.length}`} className="text-3xl font-bold">
          {line.slice(2)}
        </h1>
      );
      continue;
    }
    if (line.startsWith("## ")) {
      flushList();
      nodes.push(
        <h2 key={`h2-${nodes.length}`} className="text-xl font-semibold mt-6">
          {line.slice(3)}
        </h2>
      );
      continue;
    }
    if (line.startsWith("- ")) {
      listItems.push(line.slice(2));
      continue;
    }
    flushList();
    nodes.push(
      <p key={`p-${nodes.length}`} className="leading-relaxed">
        {line}
      </p>
    );
  }

  flushList();
  return nodes;
}

export type MarkdownArticleProps = {
  title: string;
  markdown: string;
};

export function MarkdownArticle({ title, markdown }: MarkdownArticleProps) {
  const content = simpleMarkdownToNodes(markdown);
  return (
    <article className="prose prose-neutral dark:prose-invert max-w-none space-y-4 p-6">
      <h1 className="text-3xl font-bold">{title}</h1>
      {content}
    </article>
  );
}

export default MarkdownArticle;
