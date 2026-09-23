import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassPanel } from "@/components/ui-custom/GlassPanel";
import { Button } from "@/components/ui/button";
import { IconPlus, IconClose } from "@/components/ui-custom/CustomIcon";
import { toast } from "sonner";

type Operator = "is" | "is_not" | "contains";
type Rule = { field: string; operator: Operator; value: string };
type Audience = {
  id: string;
  name: string;
  description: string | null;
  match_type: "all" | "any";
  rules: Rule[];
  estimated_size: number | null;
};

const FIELDS: { id: string; label: string; options?: string[] }[] = [
  { id: "audience_type", label: "Audience type", options: ["B2B", "B2C"] },
  { id: "industry", label: "Industry", options: ["SaaS", "E-commerce", "Finance", "Healthcare", "Education", "Manufacturing", "Nonprofit", "Agency"] },
  { id: "region", label: "Region", options: ["North America", "EMEA", "APAC", "LATAM"] },
  { id: "company_size", label: "Company size", options: ["1-10", "11-50", "51-200", "201-1000", "1000+"] },
  { id: "job_title", label: "Job title" },
  { id: "lifecycle_stage", label: "Lifecycle stage", options: ["Subscriber", "Lead", "MQL", "SQL", "Customer", "Churned"] },
  { id: "interest", label: "Interest" },
];

const OPS: { id: Operator; label: string }[] = [
  { id: "is", label: "is" },
  { id: "is_not", label: "is not" },
  { id: "contains", label: "contains" },
];

const BASE_POOL = 250_000;

/** Rough reach estimate — each rule narrows (or with "any", widens) the pool. */
function estimate(rules: Rule[], match: "all" | "any"): number {
  const active = rules.filter((r) => r.value.trim());
  if (!active.length) return BASE_POOL;
  const factor = (r: Rule) => {
    const f = FIELDS.find((x) => x.id === r.field);
    const n = f?.options?.length ?? 8;
    const share = r.operator === "is" ? 1 / n : r.operator === "is_not" ? 1 - 1 / n : 0.15;
    return share;
  };
  if (match === "all") return Math.round(active.reduce((acc, r) => acc * factor(r), BASE_POOL));
  const miss = active.reduce((acc, r) => acc * (1 - factor(r)), 1);
  return Math.round(BASE_POOL * (1 - miss));
}

const inputCls =
  "rounded-xl border border-border/50 bg-background/40 px-3 py-2 text-sm focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/25";

const emptyDraft = () => ({
  name: "",
  description: "",
  match_type: "all" as "all" | "any",
  rules: [{ field: "audience_type", operator: "is" as Operator, value: "B2B" }] as Rule[],
});

export function AudienceSection({ workspaceId, orgId }: { workspaceId: string; orgId: string }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Audience[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("campaign_audiences")
      .select("id,name,description,match_type,rules,estimated_size")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    setItems((data as unknown as Audience[]) ?? []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const size = useMemo(() => estimate(draft.rules, draft.match_type), [draft.rules, draft.match_type]);

  const updateRule = (i: number, patch: Partial<Rule>) =>
    setDraft((d) => ({ ...d, rules: d.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  const save = async () => {
    if (!user) return;
    if (!draft.name.trim()) return toast.error("Give the audience a name.");
    const rules = draft.rules.filter((r) => r.value.trim());
    if (!rules.length) return toast.error("Add at least one filter with a value.");
    setBusy(true);
    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      match_type: draft.match_type,
      rules,
      estimated_size: size,
    };
    const { error } = editingId
      ? await supabase.from("campaign_audiences").update(payload).eq("id", editingId)
      : await supabase
          .from("campaign_audiences")
          .insert({ ...payload, workspace_id: workspaceId, org_id: orgId, created_by: user.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(editingId ? "Audience updated" : "Audience saved");
    setEditingId(null);
    setDraft(emptyDraft());
    load();
  };

  const edit = (a: Audience) => {
    setEditingId(a.id);
    setDraft({ name: a.name, description: a.description ?? "", match_type: a.match_type, rules: a.rules });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("campaign_audiences").delete().eq("id", id);
    if (error) return toast.error(error.message);
    if (editingId === id) {
      setEditingId(null);
      setDraft(emptyDraft());
    }
    load();
  };

  const fieldLabel = (id: string) => FIELDS.find((f) => f.id === id)?.label ?? id;

  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <GlassPanel className="p-5">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-lg">{editingId ? "Edit audience" : "Build an audience"}</h3>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Est. reach</div>
            <div className="font-mono text-xl tabular-nums">{size.toLocaleString()}</div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            className={inputCls}
            placeholder="Audience name (e.g. EMEA SaaS marketers)"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
          <input
            className={inputCls}
            placeholder="Description (optional)"
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          />
        </div>

        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          Match
          <select
            className={inputCls}
            value={draft.match_type}
            onChange={(e) => setDraft((d) => ({ ...d, match_type: e.target.value as "all" | "any" }))}
          >
            <option value="all">all</option>
            <option value="any">any</option>
          </select>
          of these filters
        </div>

        <div className="mt-3 space-y-2">
          {draft.rules.map((r, i) => {
            const f = FIELDS.find((x) => x.id === r.field);
            const useSelect = f?.options && r.operator !== "contains";
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select
                  className={inputCls}
                  value={r.field}
                  onChange={(e) => {
                    const nf = FIELDS.find((x) => x.id === e.target.value);
                    updateRule(i, { field: e.target.value, value: nf?.options?.[0] ?? "" });
                  }}
                >
                  {FIELDS.map((x) => (
                    <option key={x.id} value={x.id}>{x.label}</option>
                  ))}
                </select>
                <select
                  className={inputCls}
                  value={r.operator}
                  onChange={(e) => updateRule(i, { operator: e.target.value as Operator })}
                >
                  {OPS.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
                {useSelect ? (
                  <select
                    className={`${inputCls} flex-1`}
                    value={r.value}
                    onChange={(e) => updateRule(i, { value: e.target.value })}
                  >
                    {f!.options!.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={`${inputCls} flex-1`}
                    placeholder="Value"
                    value={r.value}
                    onChange={(e) => updateRule(i, { value: e.target.value })}
                  />
                )}
                <button
                  type="button"
                  aria-label="Remove filter"
                  className="rounded-lg p-2 text-muted-foreground hover:text-foreground"
                  onClick={() => setDraft((d) => ({ ...d, rules: d.rules.filter((_, j) => j !== i) }))}
                >
                  <IconClose size={14} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() =>
              setDraft((d) => ({ ...d, rules: [...d.rules, { field: "industry", operator: "is", value: "SaaS" }] }))
            }
          >
            <IconPlus size={12} /> Add filter
          </Button>
          <div className="flex gap-2">
            {editingId && (
              <Button variant="ghost" size="sm" onClick={() => { setEditingId(null); setDraft(emptyDraft()); }}>
                Cancel
              </Button>
            )}
            <Button size="sm" onClick={save} disabled={busy} className="btn-keystone">
              {busy ? "Saving…" : editingId ? "Update audience" : "Save audience"}
            </Button>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Reach is a rough estimate to compare segments, not an exact contact count.
        </p>
      </GlassPanel>

      <GlassPanel className="p-5">
        <h3 className="font-display text-lg">Saved audiences</h3>
        {items.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No audiences yet for this campaign.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {items.map((a) => (
              <li key={a.id} className="rounded-xl border border-border/50 bg-background/30 p-3">
                <div className="flex items-start justify-between gap-2">
                  <button type="button" className="text-left" onClick={() => edit(a)}>
                    <div className="font-medium">{a.name}</div>
                    {a.description && <div className="text-xs text-muted-foreground">{a.description}</div>}
                  </button>
                  <button
                    type="button"
                    aria-label="Delete audience"
                    className="p-1 text-muted-foreground hover:text-foreground"
                    onClick={() => remove(a.id)}
                  >
                    <IconClose size={12} />
                  </button>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Match {a.match_type}:{" "}
                  {a.rules.map((r) => `${fieldLabel(r.field)} ${OPS.find((o) => o.id === r.operator)?.label} ${r.value}`).join(" · ")}
                </div>
                {a.estimated_size != null && (
                  <div className="mt-1 font-mono text-xs tabular-nums">~{a.estimated_size.toLocaleString()} reach</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </GlassPanel>
    </div>
  );
}
