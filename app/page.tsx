// Mock data — replace with real Supabase queries once API routes are wired
const groups = [
  { id: "1", name: "Goa Trip 2026",   members: 5, youAreOwedPaise:  240000, youOwePaise:       0 },
  { id: "2", name: "Flat — June",     members: 3, youAreOwedPaise:       0, youOwePaise:  185000 },
  { id: "3", name: "Delhi Weekend",   members: 4, youAreOwedPaise:   75000, youOwePaise:       0 },
];

const whoOwesYou = [
  { name: "Rohan", amountPaise: 145000 },
  { name: "Priya", amountPaise:  95000 },
  { name: "Aisha", amountPaise:  75000 },
];

const recentExpenses = [
  { id: "1", description: "Airbnb Kasol",       date: "Jun 12", paidBy: "You",   amountPaise: 480000, group: "Goa Trip 2026" },
  { id: "2", description: "Groceries",          date: "Jun 11", paidBy: "Rohan", amountPaise:  28000, group: "Flat — June"   },
  { id: "3", description: "Train tickets",      date: "Jun 10", paidBy: "Priya", amountPaise: 120000, group: "Delhi Weekend" },
  { id: "4", description: "Dinner — Pali Cafe", date: "Jun 09", paidBy: "You",   amountPaise:  87000, group: "Goa Trip 2026" },
];

const netPaise = whoOwesYou.reduce((sum, p) => sum + p.amountPaise, 0) - 185000;

function rupees(paise: number): string {
  return "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

// ── Shared card shell ─────────────────────────────────────────
function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border-2 border-brutal shadow-[4px_4px_0px_#000] ${className}`}
    >
      {children}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-brutal px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-white">
      {children}
    </span>
  );
}

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <h2 className="text-sm font-black uppercase tracking-widest">{label}</h2>
      {count !== undefined && (
        <Badge>{count}</Badge>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────
export default function Dashboard() {
  const isPositive = netPaise >= 0;

  return (
    <div className="flex min-h-screen flex-col gap-5 p-5">

      {/* ── Banner ── */}
      <Card className="bg-lime p-6">
        <div className="flex items-start justify-between">

          {/* Left — branding */}
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-widest opacity-60">
              FLATLEDGER · V1
            </p>
            <h1 className="text-5xl font-black leading-none tracking-tight">
              Split expenses.<br />No drama.
            </h1>
          </div>

          {/* Right — stat pills */}
          <div className="flex flex-col gap-2 items-end">
            <div className="flex items-center gap-2 rounded-full border-2 border-brutal bg-white px-4 py-2 shadow-[3px_3px_0px_#000]">
              <span className="text-xs font-bold uppercase tracking-widest opacity-50">
                Net Balance
              </span>
              <span className={`text-sm font-black ${isPositive ? "text-green-600" : "text-red-600"}`}>
                {isPositive ? "+" : "-"}{rupees(Math.abs(netPaise))}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-full border-2 border-brutal bg-white px-4 py-2 shadow-[3px_3px_0px_#000]">
              <span className="text-xs font-bold uppercase tracking-widest opacity-50">
                Groups
              </span>
              <span className="text-sm font-black">{groups.length} active</span>
            </div>
          </div>

        </div>
      </Card>

      {/* ── Three-column grid ── */}
      <div className="grid flex-1 grid-cols-3 gap-4">

        {/* Col 1 — Your groups */}
        <div className="flex flex-col">
          <SectionHeader label="Your Groups" count={groups.length} />
          <div className="flex flex-col gap-3">
            {groups.map((g) => {
              const owed    = g.youAreOwedPaise > 0;
              const balance = owed ? g.youAreOwedPaise : g.youOwePaise;
              return (
                <Card key={g.id} className="bg-white p-4">
                  <div className="mb-3 flex items-start justify-between">
                    <p className="text-lg font-black leading-tight">{g.name}</p>
                    <Badge>{g.members} members</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide opacity-50">
                      {owed ? "You're owed" : "You owe"}
                    </span>
                    <span className={`text-xl font-black ${owed ? "text-green-600" : "text-red-600"}`}>
                      {owed ? "+" : "-"}{rupees(balance)}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Col 2 — Who owes you */}
        <div className="flex flex-col">
          <SectionHeader label="Who Owes You" count={whoOwesYou.length} />
          <div className="flex flex-col gap-3">
            {whoOwesYou.map((p) => (
              <Card key={p.name} className="relative bg-brutal p-5">
                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-white/50">
                  Owes you
                </p>
                <p className="text-3xl font-black text-lime">{rupees(p.amountPaise)}</p>
                {/* Name badge — bottom left, like STRANGER card */}
                <div className="mt-4 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-white/20 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-lime" />
                    {p.name.toUpperCase()}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Col 3 — Recent expenses */}
        <div className="flex flex-col">
          <SectionHeader label="Recent Expenses" />
          <div className="flex flex-col gap-3">
            {recentExpenses.map((e) => (
              <Card key={e.id} className="bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-base font-black">{e.description}</p>
                    <p className="mt-0.5 text-xs font-medium text-black/40">
                      {e.group} · {e.date}
                    </p>
                  </div>
                  <p className="shrink-0 text-lg font-black">{rupees(e.amountPaise)}</p>
                </div>
                <div className="mt-3">
                  <Badge>
                    {e.paidBy === "You" ? "Paid by you" : `Paid by ${e.paidBy}`}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        </div>

      </div>

      {/* ── Bottom CTA ── */}
      <div className="flex justify-center pb-2 pt-1">
        <button className="flex items-center gap-3 rounded-2xl border-2 border-brutal bg-lime px-10 py-4 text-lg font-black uppercase tracking-widest shadow-[4px_4px_0px_#000] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0px_#000]">
          <span className="text-xl">+</span>
          Add Expense
        </button>
      </div>

    </div>
  );
}
