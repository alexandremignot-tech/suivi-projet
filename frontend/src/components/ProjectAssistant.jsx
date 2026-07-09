import { useState, useRef, useEffect } from "react";
import client from "../api/client";

// Assistant IA flottant, disponible sur tous les onglets d'un projet. Repond en lecture seule a
// partir des donnees reelles du projet, et peut PROPOSER (jamais executer directement) une
// action parmi trois : creer un point ouvert, ajouter une observation a un PV existant, modifier
// certains champs d'un contrat existant. Chaque proposition s'affiche sous forme de carte avec
// Confirmer/Annuler ; seule une confirmation explicite declenche l'ecriture reelle cote serveur
// (POST /projects/:id/actions/confirm).
export default function ProjectAssistant({ project, onChange }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // { role, content, proposedAction?, actionStatus? }
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function handleSend(e) {
    e.preventDefault();
    const question = input.trim();
    if (!question || sending) return;
    setInput("");
    const nextMessages = [...messages, { role: "user", content: question }];
    setMessages(nextMessages);
    setSending(true);
    try {
      // n'envoie que les 6 derniers echanges comme historique, pour rester leger
      const history = nextMessages.slice(0, -1).slice(-6).map(({ role, content }) => ({ role, content }));
      const { data } = await client.post(`/projects/${project.id}/ask`, { question, history });
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: data.answer,
          proposedAction: data.proposedAction || null,
          actionStatus: data.proposedAction ? "pending" : null,
        },
      ]);
      if (data.configured === false) setNotConfigured(true);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Erreur lors de la requete a l'assistant. Reessaie." },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function handleConfirm(index) {
    const target = messages[index];
    if (!target?.proposedAction) return;
    setMessages((m) => m.map((mm, i) => (i === index ? { ...mm, actionStatus: "confirming" } : mm)));
    try {
      const { data } = await client.post(`/projects/${project.id}/actions/confirm`, {
        type: target.proposedAction.type,
        payload: target.proposedAction.payload,
      });
      setMessages((m) => [
        ...m.map((mm, i) => (i === index ? { ...mm, actionStatus: "done" } : mm)),
        { role: "assistant", content: `Fait : ${data.message}` },
      ]);
      onChange?.();
    } catch (err) {
      setMessages((m) => [
        ...m.map((mm, i) => (i === index ? { ...mm, actionStatus: "pending" } : mm)),
        {
          role: "assistant",
          content: `Erreur : ${err?.response?.data?.error || "impossible d'executer cette action."}`,
        },
      ]);
    }
  }

  function handleCancel(index) {
    setMessages((m) => [
      ...m.map((mm, i) => (i === index ? { ...mm, actionStatus: "cancelled" } : mm)),
      { role: "assistant", content: "Action annulee, rien n'a ete modifie." },
    ]);
  }

  return (
    <div className="fixed bottom-5 right-5 z-40">
      {open && (
        <div className="mb-3 w-96 max-w-[92vw] h-[32rem] bg-white border border-slate-200 rounded-lg shadow-xl flex flex-col overflow-hidden">
          <div className="bg-brand-600 text-white px-4 py-3 flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Assistant du projet</p>
              <p className="text-[11px] text-white/80">{project.name}</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white">
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
            {messages.length === 0 && (
              <p className="text-xs text-slate-400 text-center mt-6">
                Pose une question sur ce projet : budget, planning, lots, points ouverts, PV...
                <br />
                Ex: "Ou en est le BB2 ?", "Combien de budget reste-t-il ?"
                <br />
                Tu peux aussi demander une action (toujours soumise a confirmation) :
                <br />
                "Ajoute un point ouvert sur...", "Ajoute au PV n°3 que...", "Modifie le contrat X : montant..."
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.role === "user" ? "bg-brand-600 text-white" : "bg-white border border-slate-200 text-slate-700"
                  }`}
                >
                  {m.content}
                </div>

                {m.proposedAction && (
                  <div className="mt-1 max-w-[90%] border border-amber-300 bg-amber-50 rounded-md p-2 text-xs">
                    <p className="font-medium text-amber-800 mb-1">Proposition : {m.proposedAction.summary}</p>
                    {m.proposedAction.preview && (
                      <ul className="text-slate-600 mb-2 space-y-0.5">
                        {Object.entries(m.proposedAction.preview).map(([k, v]) => (
                          <li key={k}>
                            <span className="text-slate-400">{k} : </span>
                            {String(v)}
                          </li>
                        ))}
                      </ul>
                    )}

                    {m.actionStatus === "pending" && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleConfirm(i)}
                          className="bg-brand-600 text-white px-2 py-1 rounded text-xs font-medium"
                        >
                          Confirmer
                        </button>
                        <button
                          onClick={() => handleCancel(i)}
                          className="border border-slate-300 px-2 py-1 rounded text-xs"
                        >
                          Annuler
                        </button>
                      </div>
                    )}
                    {m.actionStatus === "confirming" && <p className="text-slate-400 italic">Enregistrement...</p>}
                    {m.actionStatus === "done" && <p className="text-emerald-600 font-medium">Confirmee et enregistree.</p>}
                    {m.actionStatus === "cancelled" && <p className="text-slate-400">Annulee.</p>}
                  </div>
                )}
              </div>
            ))}
            {sending && <p className="text-xs text-slate-400 italic">L'assistant reflechit...</p>}
            {notConfigured && (
              <p className="text-[11px] text-amber-600 text-center">
                Astuce admin : configure ANTHROPIC_API_KEY sur le backend Render pour activer l'assistant.
              </p>
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSend} className="border-t border-slate-200 p-2 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ta question..."
              className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="bg-brand-600 text-white text-sm px-3 py-2 rounded-md disabled:opacity-50"
            >
              Envoyer
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="bg-brand-600 hover:bg-brand-700 text-white rounded-full w-14 h-14 shadow-lg flex items-center justify-center text-2xl"
        title="Assistant IA du projet"
      >
        {open ? "×" : "💬"}
      </button>
    </div>
  );
}
