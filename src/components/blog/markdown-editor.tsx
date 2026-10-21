import "@mdxeditor/editor/style.css";
import "./blog.css";
import { forwardRef, useId, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  BlockTypeSelect, BoldItalicUnderlineToggles, ButtonWithTooltip, CodeToggle, CreateLink, DiffSourceToggleWrapper, InsertCodeBlock, InsertImage, InsertTable,
  InsertThematicBreak, ListsToggle, MDXEditor, Separator, StrikeThroughSupSubToggles, UndoRedo, codeBlockPlugin, codeMirrorPlugin, diffSourcePlugin, headingsPlugin,
  imagePlugin, linkDialogPlugin, linkPlugin, listsPlugin, markdownShortcutPlugin, quotePlugin, tablePlugin, thematicBreakPlugin, toolbarPlugin, type MDXEditorMethods,
} from "@mdxeditor/editor";
import { VideoFramePlayHorizontalIcon } from "@solar-icons/react/linear";
import { blogEmbed } from "@shared/blog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { TextureButton } from "@/components/ui/texture-button";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

const LANGUAGES = {
  "": "Plain text", bash: "Shell", css: "CSS", go: "Go", html: "HTML", java: "Java", js: "JavaScript", json: "JSON", jsx: "JSX",
  kotlin: "Kotlin", md: "Markdown", php: "PHP", py: "Python", rust: "Rust", sql: "SQL", swift: "Swift", ts: "TypeScript", tsx: "TSX", yaml: "YAML",
};

interface EmbedHandlers { start: (ready: () => void) => void; finish: (url: string | null) => void }

/** Adds a YouTube or Gist link on its own line, which the published post embeds. */
function EmbedButton({ embed }: { embed: EmbedHandlers }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const chosen = useRef<string | null>(null);
  const close = () => { setOpen(false); setValue(""); setError(""); };
  return <>
    <ButtonWithTooltip title="Embed a YouTube video or GitHub Gist" onClick={() => { chosen.current = null; embed.start(() => setOpen(true)); }}><VideoFramePlayHorizontalIcon className="size-5" aria-hidden /></ButtonWithTooltip>
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent className="max-w-md" onCloseAutoFocus={(event) => { event.preventDefault(); embed.finish(chosen.current); chosen.current = null; }}>
        <DialogTitle>Embed a video or Gist</DialogTitle>
        <DialogDescription>Paste a YouTube video link or a GitHub Gist link. It goes on its own line and shows as a player or code in the published post.</DialogDescription>
        <form className="space-y-3" onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!blogEmbed(value)) { setError("That isn't a YouTube video or GitHub Gist link. Use an address like https://youtu.be/… or https://gist.github.com/user/…"); return; }
          chosen.current = value.trim();
          close();
        }}>
          <label htmlFor={`${id}-url`} className="block text-sm text-t2">Link</label>
          <input id={`${id}-url`} type="url" inputMode="url" className="field h-11 w-full" value={value} autoFocus aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => { setValue(event.target.value); setError(""); }} placeholder="https://youtu.be/…" />
          {error && <p id={`${id}-error`} role="alert" className="text-sm text-[hsl(var(--down))]">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <TextureButton type="button" variant="secondary" className="w-auto" onClick={close}>Cancel</TextureButton>
            <TextureButton type="submit" className="w-auto">Embed</TextureButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}

function Toolbar({ embed }: { embed: EmbedHandlers }) {
  return <DiffSourceToggleWrapper options={["rich-text", "source"]}>
    <UndoRedo />
    <Separator />
    <BlockTypeSelect />
    <BoldItalicUnderlineToggles options={["Bold", "Italic"]} />
    <StrikeThroughSupSubToggles options={["Strikethrough"]} />
    <CodeToggle />
    <Separator />
    <ListsToggle />
    <CreateLink />
    <InsertImage />
    <EmbedButton embed={embed} />
    <Separator />
    <InsertTable />
    <InsertCodeBlock />
    <InsertThematicBreak />
  </DiffSourceToggleWrapper>;
}

/**
 * Rich editing that reads and writes plain Markdown. Only syntax the published
 * renderer supports is offered: no underline, highlight or raw HTML.
 */
const MarkdownEditor = forwardRef<MDXEditorMethods, { value: string; onChange: (markdown: string, normalized: boolean) => void; labelledBy: string; describedBy?: string; invalid?: boolean }>(({ value, onChange, labelledBy, describedBy, invalid }, ref) => {
  const { resolvedTheme } = useTheme();
  const editor = useRef<MDXEditorMethods>(null);
  useImperativeHandle(ref, () => editor.current!, []);
  /**
   * Inserted content merges into the paragraph at the cursor, so clicking Embed
   * drops a placeholder at the cursor while it is still known. Choosing a link
   * rewrites the Markdown with the link on its own line; cancelling removes the
   * placeholder. The placeholder is never reported as the author's text. The
   * rewrite resets the cursor, so the editor lets go of focus rather than
   * sending the next keystrokes to the top of the post.
   */
  const group = useRef<HTMLDivElement>(null);
  const placeholder = useRef<string | null>(null);
  const embed = useRef<EmbedHandlers>({
    start: (ready) => {
      const target = editor.current;
      const content = group.current?.querySelector<HTMLElement>("[contenteditable='true']");
      const selection = window.getSelection();
      // Clicking the toolbar clears the editor's own selection but not the page's,
      // so the page's range is put back on the content for the editor to pick up.
      const range = selection?.rangeCount && content?.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null;
      if (!target || !content || !selection || !range) return ready();
      const marker = `⟨embed ${crypto.randomUUID().slice(0, 8)}⟩`;
      placeholder.current = marker;
      content.focus({ preventScroll: true });
      selection.removeAllRanges();
      selection.addRange(range);
      window.setTimeout(() => { target.insertMarkdown(marker); ready(); });
    },
    finish: (url) => {
      const target = editor.current;
      const marker = placeholder.current;
      placeholder.current = null;
      if (!target) return;
      const markdown = target.getMarkdown();
      const placed = !!marker && markdown.includes(marker);
      if (!url && !placed) return;
      const next = placed ? markdown.replace(marker!, url ? `\n\n<${url}>\n\n` : "") : `${markdown.trimEnd()}\n\n<${url}>\n`;
      target.setMarkdown(next);
      changed.current(next, false);
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest(".blog-editor")) active.blur();
    },
  });
  const changed = useRef(onChange);
  changed.current = (markdown, normalized) => {
    if (placeholder.current && markdown.includes(placeholder.current)) return;
    onChange(markdown, normalized);
  };
  const plugins = useMemo(() => [
    headingsPlugin({ allowedHeadingLevels: [2, 3, 4] }), listsPlugin(), quotePlugin(), thematicBreakPlugin(), linkPlugin(), linkDialogPlugin(),
    imagePlugin({ disableImageResize: true }), tablePlugin(), codeBlockPlugin({ defaultCodeBlockLanguage: "" }), codeMirrorPlugin({ codeBlockLanguages: LANGUAGES }),
    markdownShortcutPlugin(), diffSourcePlugin({ viewMode: "rich-text" }),
    toolbarPlugin({ toolbarContents: () => <Toolbar embed={embed.current} /> }),
  ], []);
  return <div ref={group} role="group" aria-labelledby={labelledBy} aria-describedby={describedBy} aria-invalid={invalid || undefined}>
    <MDXEditor
      ref={editor}
      className={cn("blog-editor", resolvedTheme === "dark" && "dark-theme")}
      contentEditableClassName="blog-body blog-editor-content"
      markdown={value}
      onChange={(markdown, normalized) => changed.current(markdown, normalized)}
      plugins={plugins}
      suppressHtmlProcessing
      placeholder="Write your post. Use the toolbar or Markdown shortcuts like ## for a heading."
    />
  </div>;
});
MarkdownEditor.displayName = "MarkdownEditor";
export default MarkdownEditor;
