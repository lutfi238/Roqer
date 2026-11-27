import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import type { ReleaseNotes } from "../shared/whats-new";

export function WhatsNewChanges({ notes }: { notes: ReleaseNotes }) {
  return <ul className="whats-new-changes">
    {notes.changes.map((change) => <li key={change.title}>
      <strong>{change.title}</strong>
      <p>{change.detail}</p>
    </li>)}
  </ul>;
}

export function WhatsNewDialog({ notes, onDismiss }: { notes: ReleaseNotes; onDismiss: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (dialog.current?.open === false) dialog.current.showModal();
  }, []);

  const dismiss = () => {
    dialog.current?.close();
    onDismiss();
  };

  return <dialog
    className="name-modal whats-new-dialog"
    ref={dialog}
    aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); dismiss(); }}
  >
    <header className="modal-header">
      <div>
        <h2 id={titleId}>What’s New</h2>
        <span className="whats-new-version">Roqer {notes.version}</span>
      </div>
      <button type="button" className="icon-button" aria-label="Close What’s New" onClick={dismiss}><X size={17} /></button>
    </header>
    <WhatsNewChanges notes={notes} />
    <div className="modal-actions">
      <button type="button" className="primary-action" onClick={dismiss}>Done</button>
    </div>
  </dialog>;
}
