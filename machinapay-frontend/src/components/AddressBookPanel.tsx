import React, { useState, useEffect } from "react";
import {
  BookOpen,
  Plus,
  Trash2,
  Edit2,
  Download,
  Upload,
  Search,
  Check,
  Copy,
  X,
  Tag,
} from "lucide-react";
import { addressBook, AddressBookEntry } from "../lib/addressBook";

export function AddressBookPanel() {
  const [entries, setEntries] = useState<AddressBookEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Form modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAddr, setEditingAddr] = useState<string | null>(null);
  const [formAddress, setFormAddress] = useState("");
  const [formLabel, setFormLabel] = useState("");
  const [formTag, setFormTag] = useState<"machine" | "client" | "contract" | "unknown">("client");
  const [formNotes, setFormNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Import JSON input ref
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  function reload() {
    setEntries(addressBook.getAll());
  }

  useEffect(() => {
    reload();
  }, []);

  function handleCopy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }

  function handleOpenAdd() {
    setEditingAddr(null);
    setFormAddress("");
    setFormLabel("");
    setFormTag("client");
    setFormNotes("");
    setFormError(null);
    setIsModalOpen(true);
  }

  function handleOpenEdit(entry: AddressBookEntry) {
    setEditingAddr(entry.address);
    setFormAddress(entry.address);
    setFormLabel(entry.label);
    setFormTag(entry.tag);
    setFormNotes(entry.notes || "");
    setFormError(null);
    setIsModalOpen(true);
  }

  function handleDelete(address: string) {
    if (confirm(`Remove ${addressBook.resolve(address).label} from Address Book?`)) {
      addressBook.remove(address);
      reload();
    }
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!formAddress.trim() || !/^0x[a-fA-F0-9]{40}$/.test(formAddress.trim())) {
      setFormError("Please enter a valid 42-character Ethereum address (0x...)");
      return;
    }
    if (!formLabel.trim()) {
      setFormError("Please provide a recognizable label");
      return;
    }

    addressBook.set({
      address: formAddress.trim(),
      label: formLabel.trim(),
      tag: formTag,
      notes: formNotes.trim(),
    });

    setIsModalOpen(false);
    reload();
  }

  function handleExport() {
    const data = addressBook.exportJson();
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `machinapay-address-book-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const res = addressBook.importJson(content);
      if (res.success) {
        alert(`Successfully imported ${res.count} addresses!`);
        reload();
      } else {
        alert(`Import failed: ${res.error}`);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const filteredEntries = entries.filter((e) => {
    const q = searchQuery.toLowerCase();
    return (
      e.label.toLowerCase().includes(q) ||
      e.address.toLowerCase().includes(q) ||
      e.tag.toLowerCase().includes(q)
    );
  });

  const tagBadgeStyle = {
    machine: "bg-amber-50 text-accent-amber border-amber-200",
    client: "bg-blue-50 text-accent-blue border-blue-200",
    contract: "bg-green-50 text-accent-green border-green-200",
    unknown: "bg-gray-50 text-secondary border-border",
  };

  return (
    <div className="bg-card border border-border rounded-lg shadow-sm p-5 space-y-5">
      {/* Top Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h2 className="text-base font-bold text-primary tracking-tight flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-accent-blue" />
            <span>Address Book & Entity Registry</span>
          </h2>
          <p className="text-xs text-secondary">
            Manage labeled machine identities, clients, and escrow contracts for autocomplete and tooltips.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileImport}
            accept=".json"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-page hover:bg-gray-100 text-xs font-semibold text-primary transition-colors font-mono"
            title="Import Address Book JSON"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import</span>
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-page hover:bg-gray-100 text-xs font-semibold text-primary transition-colors font-mono"
            title="Export Address Book JSON"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-blue hover:bg-blue-600 text-white text-xs font-semibold font-mono shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Address</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative max-w-sm">
        <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Filter by label, tag, or 0x address..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-page border border-border rounded-lg pl-9 pr-3 py-1.5 text-xs text-primary font-mono focus:outline-none focus:border-accent-blue"
        />
      </div>

      {/* Addresses Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead>
            <tr className="border-b border-border text-[11px] text-secondary uppercase">
              <th className="py-2.5 px-3">Entity Label</th>
              <th className="py-2.5 px-3">Ethereum Address</th>
              <th className="py-2.5 px-3">Category Tag</th>
              <th className="py-2.5 px-3">Notes</th>
              <th className="py-2.5 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredEntries.map((e) => (
              <tr key={e.address} className="hover:bg-page transition-colors">
                <td className="py-3 px-3 font-bold text-primary">{e.label}</td>
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2">
                    <span className="text-secondary">{`${e.address.slice(0, 10)}…${e.address.slice(-6)}`}</span>
                    <button
                      onClick={() => handleCopy(e.address, e.address)}
                      className="text-muted hover:text-primary"
                    >
                      {copiedKey === e.address ? (
                        <Check className="w-3 h-3 text-accent-green" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </td>
                <td className="py-3 px-3">
                  <span
                    className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase ${
                      tagBadgeStyle[e.tag] || tagBadgeStyle.unknown
                    }`}
                  >
                    {e.tag}
                  </span>
                </td>
                <td className="py-3 px-3 text-secondary text-[11px] max-w-xs truncate">
                  {e.notes || "—"}
                </td>
                <td className="py-3 px-3 text-right space-x-2">
                  <button
                    onClick={() => handleOpenEdit(e)}
                    className="p-1 rounded text-secondary hover:text-primary hover:bg-gray-100"
                    title="Edit entry"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(e.address)}
                    className="p-1 rounded text-secondary hover:text-accent-red hover:bg-gray-100"
                    title="Delete entry"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}

            {filteredEntries.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted">
                  No matching address entries found. Click "Add Address" to register an entity.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Entry Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-xl p-5 relative font-mono text-xs">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-secondary hover:text-primary"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-sm font-bold text-primary uppercase tracking-wider mb-1">
              {editingAddr ? "Edit Address Entry" : "Register Address Entry"}
            </h3>
            <p className="text-[11px] text-secondary mb-4">
              Add a recognized label to display instead of raw hex throughout the UI.
            </p>

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="text-secondary text-[10px] uppercase block mb-1">Address (0x...)</label>
                <input
                  type="text"
                  value={formAddress}
                  disabled={editingAddr !== null}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
                  className="w-full bg-page border border-border rounded p-2 text-primary focus:outline-none focus:border-accent-blue disabled:opacity-60"
                />
              </div>

              <div>
                <label className="text-secondary text-[10px] uppercase block mb-1">Label Name</label>
                <input
                  type="text"
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  placeholder="e.g. Robot M-042 Identity"
                  className="w-full bg-page border border-border rounded p-2 text-primary focus:outline-none focus:border-accent-blue"
                />
              </div>

              <div>
                <label className="text-secondary text-[10px] uppercase block mb-1">Category Tag</label>
                <select
                  value={formTag}
                  onChange={(e) => setFormTag(e.target.value as any)}
                  className="w-full bg-page border border-border rounded p-2 text-primary focus:outline-none focus:border-accent-blue"
                >
                  <option value="machine">Machine</option>
                  <option value="client">Client</option>
                  <option value="contract">Contract</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>

              <div>
                <label className="text-secondary text-[10px] uppercase block mb-1">Notes / Description (Optional)</label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="e.g. Primary delivery drone"
                  className="w-full bg-page border border-border rounded p-2 text-primary focus:outline-none focus:border-accent-blue"
                />
              </div>

              {formError && (
                <div className="p-2 rounded bg-red-50 border border-red-200 text-accent-red text-[11px]">
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded border border-border text-secondary hover:text-primary hover:bg-page font-semibold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-accent-blue hover:bg-blue-600 text-white font-semibold text-xs shadow-xs"
                >
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
