import { Fragment, type ReactNode } from "react";

// Renders Riot's tooltip markup — the <mainText>/<passive>/<magicDamage> soup
// that items.json ships in its `description`. Like Markdown, the output is
// built as React elements rather than HTML: the text comes off a CDN, so it
// must never reach dangerouslySetInnerHTML.
//
// Riot's tag vocabulary is long (~50 tags across the item set) but shallow —
// nearly all of it is inline coloring. Unknown tags render their children
// unstyled rather than disappearing, so a tag added next patch degrades to
// plain text instead of swallowing the sentence it wraps.

// Inline coloring. Damage types and scalings follow the in-client palette,
// pulled toward this app's theme so a tooltip doesn't glow next to the cards.
const INLINE_COLOR: Record<string, string> = {
  attention: "text-lol-gold-light",
  buffedstat: "text-lol-gold-light",
  ornnbonus: "text-lol-gold",
  gold: "text-lol-gold",
  spellname: "text-lol-gold",
  magicdamage: "text-[#4ab3f5]",
  magic: "text-[#4ab3f5]",
  scaleap: "text-[#4ab3f5]",
  magicpen: "text-[#4ab3f5]",
  physicaldamage: "text-[#ff8c66]",
  physical: "text-[#ff8c66]",
  scalead: "text-[#ff8c66]",
  armorpen: "text-[#ff8c66]",
  scalelethality: "text-[#ff8c66]",
  truedamage: "text-[#f0e6d2]",
  healing: "text-lol-win",
  heal: "text-lol-win",
  scalehealing: "text-lol-win",
  lifesteal: "text-lol-win",
  omnivamp: "text-lol-win",
  health: "text-lol-win",
  scalehealth: "text-lol-win",
  shield: "text-[#a0c4e0]",
  speed: "text-[#78d6b0]",
  ms: "text-[#78d6b0]",
  scalemana: "text-[#5b8dd6]",
  scalearmor: "text-[#f5d76e]",
  scalemr: "text-[#b0a0f0]",
  scaleabilityhaste: "text-[#7fd4c1]",
  scalelevel: "text-lol-text",
  scalecrit: "text-[#ff6b6b]",
  scalebonus: "text-lol-gold-light",
  scaleaf: "text-[#4ab3f5]",
  crit: "text-[#ff6b6b]",
  attackspeed: "text-[#f5a623]",
  onhit: "text-[#f5a623]",
  status: "text-[#d4a0ff]",
  keywordstealth: "text-[#b39ddb]",
  stealth: "text-[#b39ddb]",
  keyword: "text-lol-text-bright",
  keywordmajor: "text-lol-text-bright",
  prismatic: "text-[#e879f9]",
  danger: "text-lol-loss",
  raritylegendary: "text-[#ff9b52]",
  raritymythic: "text-[#ff6b9d]",
  raritygeneric: "text-lol-text",
};

// Labels that head a clause: "<passive>Sear:</passive> Damaging jungle…". Both
// the Summoner's Rift and the Mayhem (jade) item sets use them.
const LABEL_CLASS: Record<string, string> = {
  passive: "font-semibold text-lol-gold",
  spellpassive: "font-semibold text-lol-gold",
  active: "font-semibold text-lol-gold",
  unique: "font-semibold text-lol-gold",
  jadeunique: "font-semibold text-lol-gold",
  recast: "font-semibold text-lol-gold",
  titleleft: "font-semibold text-lol-text-bright",
  titleright: "font-semibold text-lol-text-bright",
};

// Blocks that break from the surrounding prose.
const BLOCK_CLASS: Record<string, string> = {
  rules: "mt-1 text-lol-text/80",
  jaderules: "mt-1 text-lol-text/80",
  jadelimit: "mt-1 text-lol-text/80",
  flavortext: "mt-1.5 italic text-lol-text/60",
};

type Token =
  | { kind: "text"; text: string }
  | { kind: "open"; tag: string; attrs: string }
  | { kind: "close"; tag: string }
  | { kind: "void"; tag: string };

// <br> and <li> never close; <li> is a separator in Riot's markup, not a
// wrapper, so treating it as a container would nest every later clause inside
// the first bullet.
const VOID_TAGS = new Set(["br", "li"]);

function tokenize(markup: string): Token[] {
  const tokens: Token[] = [];
  const re = /<(\/?)([a-zA-Z][\w]*)((?:'[^']*'|"[^"]*"|[^>'"])*)>/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markup)) !== null) {
    if (match.index > last) tokens.push({ kind: "text", text: markup.slice(last, match.index) });
    const tag = match[2].toLowerCase();
    if (VOID_TAGS.has(tag)) tokens.push({ kind: "void", tag });
    else if (match[1]) tokens.push({ kind: "close", tag });
    else tokens.push({ kind: "open", tag, attrs: match[3] });
    last = match.index + match[0].length;
  }
  if (last < markup.length) tokens.push({ kind: "text", text: markup.slice(last) });
  return tokens;
}

// Riot closes its padding inside the wrapper — a stats-only item ends
// "<br><br></mainText>" — so the trailing breaks are only reachable once the
// markup is tokens. Left in, they hang two blank lines off the bottom of every
// item that has no passive section.
function trimTrailingBreaks(tokens: Token[]): Token[] {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    if (token.kind === "close") continue;
    if (token.kind === "text" && !token.text.trim()) continue;
    if (token.kind === "void" && token.tag === "br") {
      tokens.splice(i, 1);
      continue;
    }
    break;
  }
  return tokens;
}

// <font color='#ffd700'> carries its color inline rather than by tag name.
function fontColor(attrs: string): string | undefined {
  return attrs.match(/color\s*=\s*['"]?(#[0-9a-fA-F]{3,8})/)?.[1];
}

function wrap(tag: string, attrs: string, children: ReactNode[], key: number): ReactNode {
  if (children.length === 0) return null;
  const inline = INLINE_COLOR[tag] ?? LABEL_CLASS[tag];
  if (inline) {
    return (
      <span key={key} className={inline}>
        {children}
      </span>
    );
  }
  if (BLOCK_CLASS[tag]) {
    return (
      <div key={key} className={BLOCK_CLASS[tag]}>
        {children}
      </div>
    );
  }
  if (tag === "b") {
    return (
      <strong key={key} className="font-semibold text-lol-text-bright">
        {children}
      </strong>
    );
  }
  if (tag === "font") {
    const color = fontColor(attrs);
    return (
      <span key={key} style={color ? { color } : undefined}>
        {children}
      </span>
    );
  }
  // <mainText>, <stats>, and anything Riot adds later.
  return <Fragment key={key}>{children}</Fragment>;
}

function build(tokens: Token[]): ReactNode[] {
  // A stack of open elements. Riot's markup is not always balanced, so a close
  // with no open is ignored, and tags left open at the end still render.
  const root: ReactNode[] = [];
  const stack: { tag: string; attrs: string; children: ReactNode[] }[] = [];
  let key = 0;
  const top = () => (stack.length ? stack[stack.length - 1].children : root);

  const closeFrame = () => {
    const frame = stack.pop()!;
    const node = wrap(frame.tag, frame.attrs, frame.children, key++);
    if (node !== null) top().push(node);
  };

  for (const token of tokens) {
    if (token.kind === "text") {
      if (token.text) top().push(token.text.replace(/&nbsp;/g, " "));
    } else if (token.kind === "void") {
      // <li> is a break plus a marker, with the clause flowing after it — the
      // markup has no element to hang a real list item off.
      if (token.tag === "br") top().push(<br key={key++} />);
      else
        top().push(
          <br key={key++} />,
          <span key={key++} className="select-none text-lol-text/40">
            •&nbsp;
          </span>,
        );
    } else if (token.kind === "open") {
      stack.push({ tag: token.tag, attrs: token.attrs, children: [] });
    } else {
      const depth = stack.findLastIndex((frame) => frame.tag === token.tag);
      if (depth === -1) continue;
      // Anything still open inside the closing tag gets closed with it.
      while (stack.length > depth) closeFrame();
    }
  }
  while (stack.length) closeFrame();
  return root;
}

const BR = String.raw`<br\s*\/?>`;

// Riot's markup is written against the client's own tooltip layout, which
// swallows the padding it leans on. Left alone here it opens with blank lines
// (Mayhem's jade items carry an empty <stats></stats> where the Rift items
// carry their stat block) and puts three or four blank lines mid-tooltip.
//
// The leading <mainText> goes with them; it only ever wraps the whole string,
// and dropping the open tag lets the "close with no open" rule discard its
// partner.
// "%i:scaleAD%" asks the game's own renderer to inline a stat sprite. There are
// no sprites here, and left in place it reads as "Gain%i:scaleAD% 20% Attack
// Damage" — so drop the marker and let the words close up around it.
const INLINE_ICON = /%i:[A-Za-z0-9_]+%/g;

function normalize(markup: string): string {
  return (
    markup
      .replace(INLINE_ICON, "")
      // A value that scales with level or stats has no single number in the bundled
      // text, which leaves "Gain % Heal" and "()" behind; mark the blank instead.
      .replace(/\(\s*\)/g, "")
      .replace(/(^|[\s>(+])%/g, "$1X%")
      .replace(/^\s*<mainText>/i, "")
      .replace(new RegExp(String.raw`^(?:\s|<stats>\s*<\/stats>|${BR})+`, "i"), "")
      .replace(new RegExp(String.raw`(?:${BR}\s*){3,}`, "gi"), "<br><br>")
  );
}

export default function RiotText({ markup }: { markup: string }) {
  if (!markup.trim()) return null;
  return <>{build(trimTrailingBreaks(tokenize(normalize(markup))))}</>;
}
