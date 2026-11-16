import React, { useEffect, useMemo, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import TextEngine from 'spring-text-engine';

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

interface HeadingController {
  host: HTMLElement;
  root: Root;
  setText: (nextText: string) => void;
  setVisible: (visible: boolean) => void;
  getText: () => string;
}

const controllers = new Set<HeadingController>();
const managedNodes = new WeakSet<Node>();
let pendingUpgradeIds = false;

function EmojiUnit({ char }: { char: string }) {
  return <span aria-hidden="true">{char}</span>;
}

function splitGraphemes(input: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (loc?: string, opts?: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (typeof Seg === 'function') {
    const segmenter = new Seg(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(input), (s) => s.segment);
  }
  return Array.from(input);
}

function isEmojiOrMultiUnit(grapheme: string): boolean {
  if (grapheme.length > 1) return true;
  const code = grapheme.codePointAt(0) ?? 0;
  if (code > 0xffff) return true;
  if (/[\u2600-\u27BF\u2B00-\u2BFF\u2300-\u23FF\u2190-\u21FF\u25A0-\u25FF\uFE0F]/u.test(grapheme)) {
    return true;
  }
  return false;
}

function buildEngineChildren(text: string): React.ReactNode {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  const words = normalized.split(' ');
  const nodes: React.ReactNode[] = [];
  let textBuffer: string[] = [];

  const flushText = (idxKey: number) => {
    if (textBuffer.length > 0) {
      nodes.push(textBuffer.join(' '));
      textBuffer = [];
    }
    void idxKey;
  };

  words.forEach((word, wIdx) => {
    const graphemes = splitGraphemes(word);
    const hasSpecial = graphemes.some(isEmojiOrMultiUnit);
    if (!hasSpecial) {
      textBuffer.push(word);
    } else {
      flushText(wIdx);
      let asciiRun = '';
      graphemes.forEach((g, gIdx) => {
        if (isEmojiOrMultiUnit(g)) {
          if (asciiRun) {
            nodes.push(asciiRun);
            asciiRun = '';
          }
          nodes.push(<EmojiUnit key={`emoji-${wIdx}-${gIdx}`} char={g} />);
        } else {
          asciiRun += g;
        }
      });
      if (asciiRun) {
        nodes.push(asciiRun);
      }
    }
  });

  flushText(words.length);
  return nodes.length === 1 && typeof nodes[0] === 'string' ? nodes[0] : nodes;
}

function isElementVisibleInApp(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const welcomeContainer = document.getElementById('zipshareWelcomeContainer');
  const appEl = document.getElementById('app');

  const isInsideApp = appEl ? appEl.contains(el) : false;
  if (isInsideApp && appEl && !appEl.classList.contains('show')) {
    if (welcomeContainer && welcomeContainer.style.display !== 'none' && !welcomeContainer.classList.contains('hidden')) {
      return false;
    }
  }

  let cur: HTMLElement | null = el;
  while (cur && cur !== document.body && cur !== document.documentElement) {
    const style = window.getComputedStyle(cur);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    cur = cur.parentElement;
  }
  return true;
}

function parseInlineStyle(styleStr: string): React.CSSProperties {
  const result: Record<string, string> = {};
  if (!styleStr) return result;
  styleStr.split(';').forEach((decl) => {
    const colonIdx = decl.indexOf(':');
    if (colonIdx === -1) return;
    const rawProp = decl.slice(0, colonIdx).trim();
    const val = decl.slice(colonIdx + 1).trim();
    if (!rawProp || !val) return;
    const camelProp = rawProp.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
    result[camelProp] = val;
  });
  return result as React.CSSProperties;
}

interface SpringHeadingProps {
  tag: HeadingTag;
  initialText: string;
  initialVisible: boolean;
  centered: boolean;
  className: string;
  id?: string;
  titleAttr?: string;
  inlineStyle: React.CSSProperties;
  dataAttrs: Record<string, string>;
  onMountController: (ctrl: {
    setText: (t: string) => void;
    setVisible: (v: boolean) => void;
    getText: () => string;
  }) => void;
}

function SpringHeading({
  tag,
  initialText,
  initialVisible,
  centered,
  className,
  id,
  titleAttr,
  inlineStyle,
  dataAttrs,
  onMountController,
}: SpringHeadingProps) {
  const [text, setText] = useState(initialText);
  const [visible, setVisible] = useState(initialVisible);

  useEffect(() => {
    onMountController({
      setText: (next: string) => setText(next),
      setVisible: (v: boolean) => setVisible(v),
      getText: () => text,
    });
  });

  const children = useMemo(() => buildEngineChildren(text), [text]);

  const combinedClassName = useMemo(() => {
    const base = className.trim();
    if (centered) {
      return base ? `${base} justify-center` : 'justify-center';
    }
    return base;
  }, [className, centered]);

  const combinedStyle = useMemo<React.CSSProperties>(() => {
    const next: React.CSSProperties = { ...inlineStyle };
    if (centered) {
      next.justifyContent = 'center';
    }
    return next;
  }, [inlineStyle, centered]);

  return (
    <TextEngine
      tag={tag}
      id={id}
      title={titleAttr}
      mode="once"
      enabled={visible}
      letterOut={{ opacity: 0, y: 30 }}
      letterIn={{ opacity: 1, y: 0 }}
      letterConfig={{ tension: 420, friction: 12 }}
      letterStagger={28}
      className={combinedClassName}
      letterClassName="ste-letter"
      style={combinedStyle}
      {...dataAttrs}
    >
      {children}
    </TextEngine>
  );
}

function upgradeHeading(origEl: HTMLHeadingElement) {
  if (managedNodes.has(origEl) || origEl.hasAttribute('data-ste-managed')) return;
  if (origEl.closest('.ste-host')) return;

  const parent = origEl.parentElement;
  if (!parent) return;

  const tag = origEl.tagName.toLowerCase() as HeadingTag;
  const rawText = (origEl.textContent || '').replace(/\s+/g, ' ').trim();
  const computed = window.getComputedStyle(origEl);
  const centered = computed.textAlign === 'center';
  const visible = isElementVisibleInApp(origEl);
  const id = origEl.id || undefined;
  const className = origEl.getAttribute('class') || '';
  const titleAttr = origEl.getAttribute('title') || undefined;
  const inlineStyle = parseInlineStyle(origEl.getAttribute('style') || '');

  const dataAttrs: Record<string, string> = {};
  Array.from(origEl.attributes).forEach((attr) => {
    if (attr.name.startsWith('data-') || attr.name.startsWith('aria-')) {
      dataAttrs[attr.name] = attr.value;
    }
  });
  dataAttrs['data-ste-managed'] = 'true';

  const host = document.createElement('span');
  host.className = 'ste-host';
  host.style.display = 'contents';
  managedNodes.add(host);
  managedNodes.add(origEl);

  parent.replaceChild(host, origEl);

  let latestText = rawText;
  let ctrlSetText: (t: string) => void = (t) => {
    latestText = t;
  };
  let ctrlSetVisible: (v: boolean) => void = () => {};

  const root = createRoot(host);
  flushSync(() => {
    root.render(
      <SpringHeading
        tag={tag}
        initialText={rawText}
        initialVisible={visible}
        centered={centered}
        className={className}
        id={id}
        titleAttr={titleAttr}
        inlineStyle={inlineStyle}
        dataAttrs={dataAttrs}
        onMountController={(c) => {
          ctrlSetText = (next: string) => {
            const cleaned = String(next ?? '').replace(/\s+/g, ' ').trim();
            if (cleaned === latestText) return;
            latestText = cleaned;
            c.setText(cleaned);
          };
          ctrlSetVisible = c.setVisible;
        }}
      />
    );
  });

  const renderedHeading = host.firstElementChild as HTMLElement | null;
  if (renderedHeading) {
    managedNodes.add(renderedHeading);
    try {
      Object.defineProperty(renderedHeading, 'textContent', {
        configurable: true,
        get() {
          return latestText;
        },
        set(val: unknown) {
          ctrlSetText(String(val ?? ''));
        },
      });
      Object.defineProperty(renderedHeading, 'innerText', {
        configurable: true,
        get() {
          return latestText;
        },
        set(val: unknown) {
          ctrlSetText(String(val ?? ''));
        },
      });
    } catch {
      // Fallback if non-configurable
    }
  }

  controllers.add({
    host,
    root,
    setText: (t) => ctrlSetText(t),
    setVisible: (v) => ctrlSetVisible(v),
    getText: () => latestText,
  });
}

function scanAndUpgradeHeadings(rootNode: ParentNode = document) {
  const headings = rootNode.querySelectorAll<HTMLHeadingElement>('h1, h2, h3, h4, h5, h6');
  headings.forEach((h) => {
    upgradeHeading(h);
  });
}

function refreshVisibilityAndCleanup() {
  controllers.forEach((ctrl) => {
    if (!ctrl.host.isConnected) {
      controllers.delete(ctrl);
      setTimeout(() => {
        try {
          ctrl.root.unmount();
        } catch {
          // Ignore already unmounted roots
        }
      }, 0);
      return;
    }
    ctrl.setVisible(isElementVisibleInApp(ctrl.host));
  });
}

function scheduleCheck() {
  if (pendingUpgradeIds) return;
  pendingUpgradeIds = true;
  queueMicrotask(() => {
    pendingUpgradeIds = false;
    scanAndUpgradeHeadings(document);
    refreshVisibilityAndCleanup();
  });
}

function initSpringHeadings() {
  scanAndUpgradeHeadings(document);

  const observer = new MutationObserver((mutations) => {
    let shouldCheck = false;
    for (const m of mutations) {
      if (m.type === 'childList') {
        m.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement && !managedNodes.has(node) && !node.closest('.ste-host')) {
            if (/^H[1-6]$/.test(node.tagName)) {
              upgradeHeading(node as HTMLHeadingElement);
            } else if (node.querySelector('h1, h2, h3, h4, h5, h6')) {
              scanAndUpgradeHeadings(node);
            }
          }
        });
        if (m.removedNodes.length > 0) {
          shouldCheck = true;
        }
      } else if (m.type === 'attributes') {
        const target = m.target;
        if (
          target instanceof HTMLElement &&
          !target.classList.contains('ste-letter') &&
          !target.closest('.ste-host')
        ) {
          shouldCheck = true;
        }
      }
    }
    if (shouldCheck) {
      scheduleCheck();
    }
  });

  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSpringHeadings);
} else {
  initSpringHeadings();
}
