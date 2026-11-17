/**
 * Zero-dependency Remark AST plugin that preserves safe inline formatting HTML tags
 * (<u>, <mark>, <sup>, <sub>, <s>) emitted during PDF/DOCX extraction (such as
 * underlined Arabic grammar words in "أعرب ما تحته خط") so ReactMarkdown renders
 * them natively with crisp editorial styling instead of dropping raw HTML.
 */

type MdastNode = {
  type: string;
  value?: string;
  children?: MdastNode[];
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
  };
};

const SUPPORTED_INLINE_TAGS = new Set(['u', 'ins', 'mark', 'sup', 'sub', 's']);

function getTagProps(tagName: string): Record<string, unknown> {
  switch (tagName) {
    case 'u':
    case 'ins':
      return {
        className: 'underline decoration-2 underline-offset-4 decoration-slate-900 font-semibold',
      };
    case 'mark':
      return {
        className: 'bg-amber-200/75 text-slate-900 px-1 rounded-xs',
      };
    case 's':
      return {
        className: 'line-through text-slate-500',
      };
    case 'sup':
      return {
        className: 'text-[0.75em] align-super',
      };
    case 'sub':
      return {
        className: 'text-[0.75em] align-sub',
      };
    default:
      return {};
  }
}

const SINGLE_FULL_TAG_RE = /^<(u|ins|mark|sup|sub|s)(?:\s[^>]*)?>([\s\S]*?)<\/\1>$/i;
const OPEN_TAG_RE = /^<(u|ins|mark|sup|sub|s)(?:\s[^>]*)?>$/i;
const CLOSE_TAG_RE = /^<\/(u|ins|mark|sup|sub|s)>$/i;

function splitInlineHtmlText(node: MdastNode): MdastNode[] {
  if (node.type !== 'html' || typeof node.value !== 'string') {
    return [node];
  }
  const fullMatch = node.value.trim().match(SINGLE_FULL_TAG_RE);
  if (fullMatch) {
    const tag = fullMatch[1].toLowerCase();
    const innerText = fullMatch[2];
    if (SUPPORTED_INLINE_TAGS.has(tag)) {
      return [
        {
          type: 'inlineStyledTag',
          children: [{ type: 'text', value: innerText }],
          data: {
            hName: tag,
            hProperties: getTagProps(tag),
          },
        },
      ];
    }
  }
  return [node];
}

function transformChildren(children: MdastNode[]): MdastNode[] {
  const expanded: MdastNode[] = [];
  for (const child of children) {
    if (Array.isArray(child.children)) {
      child.children = transformChildren(child.children);
    }
    const split = splitInlineHtmlText(child);
    expanded.push(...split);
  }

  const stack: Array<{ tag: string; collected: MdastNode[] }> = [];
  const rootOutput: MdastNode[] = [];

  const pushToActive = (node: MdastNode) => {
    if (stack.length > 0) {
      stack[stack.length - 1].collected.push(node);
    } else {
      rootOutput.push(node);
    }
  };

  for (const node of expanded) {
    if (node.type === 'html' && typeof node.value === 'string') {
      const trimmed = node.value.trim();
      const openMatch = trimmed.match(OPEN_TAG_RE);
      if (openMatch) {
        const tag = openMatch[1].toLowerCase();
        stack.push({ tag, collected: [] });
        continue;
      }

      const closeMatch = trimmed.match(CLOSE_TAG_RE);
      if (closeMatch) {
        const closeTag = closeMatch[1].toLowerCase();
        const matchIdx = (() => {
          for (let i = stack.length - 1; i >= 0; i--) {
            if (stack[i].tag === closeTag) return i;
          }
          return -1;
        })();

        if (matchIdx !== -1) {
          // Unwind any unclosed inner tags gracefully before wrapping the matched tag
          while (stack.length - 1 > matchIdx) {
            const unclosed = stack.pop()!;
            pushToActive({ type: 'html', value: `<${unclosed.tag}>` });
            for (const n of unclosed.collected) pushToActive(n);
          }
          const frame = stack.pop()!;
          pushToActive({
            type: 'inlineStyledTag',
            children: frame.collected,
            data: {
              hName: frame.tag,
              hProperties: getTagProps(frame.tag),
            },
          });
          continue;
        }
      }
    }

    pushToActive(node);
  }

  // Flush any leftover unclosed tags verbatim
  while (stack.length > 0) {
    const leftover = stack.shift()!;
    rootOutput.push({ type: 'html', value: `<${leftover.tag}>` });
    rootOutput.push(...leftover.collected);
  }

  return rootOutput;
}

export function remarkInlineHtmlPlugin() {
  return (tree: MdastNode) => {
    if (tree && Array.isArray(tree.children)) {
      tree.children = transformChildren(tree.children);
    }
  };
}

export default remarkInlineHtmlPlugin;
