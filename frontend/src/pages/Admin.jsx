import React, { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import "../styles/admin.css";

function ListManager({ label, endpoint, fieldName, allowBulkImport }) {
  const [items, setItems] = useState([]);
  const [newValue, setNewValue] = useState("");
  const [error, setError] = useState(null);
  const [bulkText, setBulkText] = useState("");
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    const res = await fetch(endpoint);
    const data = await res.json();
    setItems(data);
  }, [endpoint]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!newValue.trim()) return;
    setError(null);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [fieldName]: newValue }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setNewValue("");
    load();
  };

  const toggleActive = async (item) => {
    await fetch(`${endpoint}/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !item.active }),
    });
    load();
  };

  const remove = async (item) => {
    setError(null);
    const res = await fetch(`${endpoint}/${item.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error);
      return;
    }
    load();
  };

  const parseWordsFromText = (text) => {
    return text
      .split(/[\r\n,]+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 0)
      .filter((w) => w.toLowerCase() !== "word"); // drop a CSV header if present
  };

  const runBulkImport = async (words) => {
    setError(null);
    setBulkResult(null);
    const res = await fetch(`${endpoint}/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ words }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setBulkResult(data);
    setBulkText("");
    load();
  };

  const handleBulkPaste = () => {
    const words = parseWordsFromText(bulkText);
    if (words.length === 0) return;
    runBulkImport(words);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const words = parseWordsFromText(text);
    if (words.length === 0) {
      setError("Couldn't find any words in that file");
      return;
    }
    runBulkImport(words);
    e.target.value = "";
  };

  return (
    <div>
      {error && <div className="admin-error">{error}</div>}

      <div className="admin-add-row">
        <input
          placeholder={`Add a new ${label.toLowerCase()}`}
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button onClick={add}>Add</button>
      </div>

      {allowBulkImport && (
        <div className="bulk-import">
          <button className="bulk-toggle" onClick={() => setBulkOpen((o) => !o)}>
            {bulkOpen ? "Hide bulk import" : "Bulk import"}
          </button>
          {bulkOpen && (
            <div className="bulk-panel">
              <p className="bulk-hint">
                Upload a CSV/text file, or paste words separated by commas or new lines.
              </p>
              <input type="file" accept=".csv,.txt" ref={fileInputRef} onChange={handleFileChange} />
              <textarea
                placeholder="battery, volcano, dragon..."
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={4}
              />
              <button onClick={handleBulkPaste}>Import pasted words</button>
              {bulkResult && (
                <p className="bulk-result">
                  Added {bulkResult.added} new, skipped {bulkResult.skipped} (already existed or invalid).
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <table className="admin-table">
        <thead>
          <tr>
            <th>{label}</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item[fieldName]}</td>
              <td>
                <span className={`badge ${item.active ? "active" : "inactive"}`}>
                  {item.active ? "Active" : "Inactive"}
                </span>
              </td>
              <td>
                <button className="btn-toggle" onClick={() => toggleActive(item)}>
                  {item.active ? "Deactivate" : "Activate"}
                </button>
                <button className="btn-delete" onClick={() => remove(item)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryList() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    fetch("/api/history").then((r) => r.json()).then(setRows);
  }, []);

  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Word</th>
          <th>Style</th>
          <th>Spins used</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.spin_date}-${i}`}>
            <td>{r.spin_date}</td>
            <td>{r.word}</td>
            <td>{r.style}</td>
            <td>{r.spins_used}</td>
            <td>
              {r.cycle_reset && <span className="badge inactive">cycle reset</span>}{" "}
              {r.cap_relaxed && <span className="badge inactive">cap relaxed</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Admin() {
  const [tab, setTab] = useState("words");

  return (
    <div className="admin-wrap">
      <Link to="/" className="admin-back">&larr; Back to spinner</Link>
      <h1>Word Spinner admin</h1>
      <div className="admin-tabs">
        <button className={`admin-tab ${tab === "words" ? "active" : ""}`} onClick={() => setTab("words")}>
          Words
        </button>
        <button className={`admin-tab ${tab === "styles" ? "active" : ""}`} onClick={() => setTab("styles")}>
          Styles
        </button>
        <button className={`admin-tab ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>
          History
        </button>
      </div>

      {tab === "words" && (
        <ListManager label="Word" endpoint="/api/words" fieldName="text" allowBulkImport />
      )}
      {tab === "styles" && <ListManager label="Style" endpoint="/api/styles" fieldName="name" />}
      {tab === "history" && <HistoryList />}
    </div>
  );
}
