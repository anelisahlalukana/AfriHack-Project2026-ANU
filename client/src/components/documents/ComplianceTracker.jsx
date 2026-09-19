import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAdviserCompliance, updateAdviserCompliance } from "@/api/documents";

// Adviser-facing compliance status: qualification/CPD standing and
// PEP / terrorism-financing screening flags, with an edit form.
const QUALIFICATION_STATUSES = [
  { value: "qualified", label: "Qualified" },
  { value: "pending", label: "Pending" },
  { value: "suspended", label: "Suspended" },
];

const CPD_STATUSES = [
  { value: "up_to_date", label: "Up to date" },
  { value: "in_progress", label: "In progress" },
  { value: "not_started", label: "Not started" },
  { value: "overdue", label: "Overdue" },
];

function statusVariant(value) {
  if (["qualified", "up_to_date"].includes(value)) return "border-success/40 bg-success/10 text-success";
  if (["suspended", "overdue"].includes(value)) return "border-destructive/40 bg-destructive/10 text-destructive";
  return "border-warning/40 bg-warning/10 text-warning";
}

export function ComplianceTracker({ adviserId }) {
  const [compliance, setCompliance] = useState(null);
  const [form, setForm] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const record = await getAdviserCompliance(adviserId);
        if (cancelled) return;
        setError(null);
        setCompliance(record);
        setForm(record);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [adviserId]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAdviserCompliance(adviserId, {
        qualification_status: form.qualification_status,
        cpd_status: form.cpd_status,
        is_politically_exposed: form.is_politically_exposed,
        pep_details: form.pep_details,
        terrorism_financing_flag: form.terrorism_financing_flag,
        terrorism_financing_details: form.terrorism_financing_details,
      });
      setCompliance(updated);
      setForm(updated);
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!compliance) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Compliance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error || "Loading..."}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compliance</CardTitle>
        <CardDescription>Qualification, CPD and screening status</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!editing ? (
          <>
            <div className="flex flex-wrap gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Qualification</p>
                <Badge variant="outline" className={statusVariant(compliance.qualification_status)}>
                  {QUALIFICATION_STATUSES.find((s) => s.value === compliance.qualification_status)
                    ?.label || compliance.qualification_status}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">CPD</p>
                <Badge variant="outline" className={statusVariant(compliance.cpd_status)}>
                  {CPD_STATUSES.find((s) => s.value === compliance.cpd_status)?.label ||
                    compliance.cpd_status}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">PEP check</p>
                <Badge
                  variant="outline"
                  className={
                    compliance.is_politically_exposed
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : "border-success/40 bg-success/10 text-success"
                  }
                >
                  {compliance.is_politically_exposed ? "Flagged" : "Clear"}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Terrorism financing check</p>
                <Badge
                  variant="outline"
                  className={
                    compliance.terrorism_financing_flag
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : "border-success/40 bg-success/10 text-success"
                  }
                >
                  {compliance.terrorism_financing_flag ? "Flagged" : "Clear"}
                </Badge>
              </div>
            </div>
            {(compliance.pep_details || compliance.terrorism_financing_details) && (
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                {compliance.pep_details && <p>PEP notes: {compliance.pep_details}</p>}
                {compliance.terrorism_financing_details && (
                  <p>Terrorism financing notes: {compliance.terrorism_financing_details}</p>
                )}
              </div>
            )}
            <Button size="sm" className="self-start" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Qualification status</Label>
                <Select
                  value={form.qualification_status}
                  onValueChange={(v) => setForm({ ...form, qualification_status: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {QUALIFICATION_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>CPD status</Label>
                <Select
                  value={form.cpd_status}
                  onValueChange={(v) => setForm({ ...form, cpd_status: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {CPD_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="pep-flag"
                  checked={form.is_politically_exposed}
                  onCheckedChange={(c) => setForm({ ...form, is_politically_exposed: Boolean(c) })}
                />
                <Label htmlFor="pep-flag">Politically exposed person flag</Label>
              </div>
              {form.is_politically_exposed && (
                <Input
                  placeholder="PEP details"
                  value={form.pep_details || ""}
                  onChange={(e) => setForm({ ...form, pep_details: e.target.value })}
                />
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="tf-flag"
                  checked={form.terrorism_financing_flag}
                  onCheckedChange={(c) =>
                    setForm({ ...form, terrorism_financing_flag: Boolean(c) })
                  }
                />
                <Label htmlFor="tf-flag">Terrorism-financing check flag</Label>
              </div>
              {form.terrorism_financing_flag && (
                <Input
                  placeholder="Terrorism financing details"
                  value={form.terrorism_financing_details || ""}
                  onChange={(e) => setForm({ ...form, terrorism_financing_details: e.target.value })}
                />
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setForm(compliance);
                  setEditing(false);
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
