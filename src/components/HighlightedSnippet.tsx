interface HighlightedSnippetProps {
  snippet: string;
  className?: string;
}

export function HighlightedSnippet({ snippet, className = '' }: HighlightedSnippetProps) {
  const parts = snippet.split(/(\[\[M\]\][\s\S]*?\[\[\/M\]\])/g);

  return (
    <span className={className}>
      {parts.map((part, idx) => {
        if (part.startsWith('[[M]]') && part.endsWith('[[/M]]')) {
          const text = part.slice(5, -6);
          return (
            <mark
              key={idx}
              className="rounded bg-amber-200 px-0.5 font-medium text-slate-900"
            >
              {text}
            </mark>
          );
        }
        return <span key={idx}>{part}</span>;
      })}
    </span>
  );
}
