"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { pen } from "@/lib/api";
import type { PenBook } from "@/lib/pen";

type Status = Awaited<ReturnType<typeof pen.status>>;

/**
 * Import a book from pen: connect once (pen's address, and its password if
 * it's locked: only the session pen answers with is kept), then pick a book.
 * The new book stays linked, so its manuscript can be pulled again.
 */
export default function PenImport({ linked, onClose }: { linked: Map<string, string[]>; onClose: () => void }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [books, setBooks] = useState<PenBook[] | null>(null);
  const [url, setUrl] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const s = await pen.status();
      setStatus(s);
      if (s.url) setUrl(s.url);
      if (s.error) setError(s.error);
      setBooks(s.signedIn ? await pen.books<PenBook[]>() : null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy("connect");
    setError(null);
    try {
      await pen.connect(url, password);
      setPassword("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function importBook(doc: string) {
    setBusy(doc);
    setError(null);
    try {
      const { id } = await pen.import(doc);
      router.push(`/b/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  async function forget() {
    await pen.forget();
    setBooks(null);
    await load();
  }

  return (
    <section className="panel pen-import">
      <div className="row spread">
        <h2>Import from pen</h2>
        <button type="button" className="link" onClick={onClose}>
          Close
        </button>
      </div>
      {status === null ? (
        <p className="muted">Checking pen…</p>
      ) : !status.signedIn ? (
        <form className="pen-connect" onSubmit={(e) => void connect(e)}>
          <p className="intro">
            {status.url ? "Sign in to pen again." : "Where's your pen?"} If it's locked, its password signs in once: only the session pen answers with is kept, never the
            password.
          </p>
          <input type="url" required placeholder="https://pen.example.com" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="pen's address" />
          <input type="password" placeholder="Password (if locked)" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="pen's password" />
          <button type="submit" className="primary" disabled={busy !== null}>
            {busy === "connect" ? "Connecting…" : "Connect"}
          </button>
        </form>
      ) : (
        <>
          <p className="intro">
            From <a href={status.url ?? undefined}>{status.url}</a>. Imported books stay linked: pull their manuscript again from the Manuscript tab, or on every export.{" "}
            <button type="button" className="link" onClick={() => void forget()}>
              Disconnect
            </button>
          </p>
          {books === null ? (
            <p className="muted">Loading…</p>
          ) : books.length === 0 ? (
            <p className="muted">pen has no books.</p>
          ) : (
            <ul className="pen-books">
              {books.map((b) => (
                <li key={b.id}>
                  <span>
                    <strong>{b.title}</strong>
                    <span className="muted">
                      {" "}
                      · {b.words.toLocaleString("en")} words · edited {new Date(b.modified).toLocaleDateString()}
                    </span>
                    {linked.has(b.id) && (
                      <span className="muted">
                        {" "}
                        · linked to{" "}
                        {linked.get(b.id)?.map((id, i) => (
                          <span key={id}>
                            {i > 0 && ", "}
                            <a href={`/b/${id}`}>{id}</a>
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  <button type="button" disabled={busy !== null} onClick={() => void importBook(b.id)}>
                    {busy === b.id ? "Importing…" : linked.has(b.id) ? "Import again" : "Import"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
