/* Sequential loader for the verbatim original scripts. They are classic IIFE
   scripts (not modules) that expect the DOM to exist and to run in document
   order — so we append them one at a time after React has rendered the shell. */
const loaded = new Set<string>();

export async function loadScriptsSequentially(srcs: string[]): Promise<void> {
  for (const src of srcs) {
    if (loaded.has(src)) continue;
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("failed to load " + src));
      document.body.appendChild(s);
    });
    loaded.add(src);
  }
}
