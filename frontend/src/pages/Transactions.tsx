import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Download, 
  Lock, 
  FileCheck, 
  FileText, 
  ExternalLink, 
  Check, 
  AlertCircle, 
  TrendingDown,
  Clock,
  Globe
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { formatINR } from '../lib/utils';

// Status Badge Styling Mapper
const getStatusBadge = (status: string) => {
  const styles: Record<string, string> = {
    'Escrow Secured': 'bg-violet-50 text-violet-700 border-violet-200',
    'Delivery Verified': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'Settlement Released': 'bg-teal-50 text-teal-700 border-teal-200',
    'Awaiting Verification': 'bg-amber-50 text-amber-700 border-amber-200',
    'Awaiting Payment': 'bg-blue-50 text-blue-700 border-blue-200',
    'Supplier Review Active': 'bg-indigo-50 text-indigo-700 border-indigo-200',
    'Disputed / Locked': 'bg-rose-50 text-rose-700 border-rose-200',
    'Refunded': 'bg-slate-100 text-slate-700 border-slate-200'
  };
  return (
    <Badge variant="outline" className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border shadow-none shrink-0 ${styles[status] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
      {status}
    </Badge>
  );
};

export const Transactions = () => {
  const [ledger, setLedger] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedRow, setSelectedRow] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SECURED' | 'VERIFIED' | 'SETTLED'>('ALL');

  // Fetch settlements ledger
  const fetchSettlements = async () => {
    try {
      const resLedger = await fetch('/api/settlements/ledger').then(r => r.ok ? r.json() : null);
      if (resLedger && Array.isArray(resLedger)) {
        setLedger(resLedger);
        if (resLedger.length > 0 && !selectedRow) {
          setSelectedRow(resLedger[0]);
        }
      }
    } catch (err) {
      console.error('Error fetching settlements data:', err);
      toast.error('Failed to load transaction ledger.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettlements();
  }, []);

  // Filtered ledger rows based on tabs and query
  const filteredLedger = ledger.filter(row => {
    const sName = (row.supplier || '').toLowerCase();
    const sId = (row.id || '').toLowerCase();
    const sCat = (row.category || '').toLowerCase();
    const q = searchQuery.toLowerCase();
    
    const matchesSearch = sName.includes(q) || sId.includes(q) || sCat.includes(q);
    if (!matchesSearch) return false;

    if (statusFilter === 'SECURED') {
      return row.status === 'Escrow Secured' || row.status === 'Awaiting Payment';
    }
    if (statusFilter === 'VERIFIED') {
      return row.status === 'Delivery Verified' || row.status === 'Awaiting Verification';
    }
    if (statusFilter === 'SETTLED') {
      return row.status === 'Settlement Released';
    }
    return true;
  });

  // Handle escrow release trigger
  const handleReleaseSettlement = async (id: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/procurement/release-settlement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ transaction_id: id })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to release escrow.');
      }

      toast.success('Settlement released successfully (simulated payout).');
      fetchSettlements();
    } catch (err: any) {
      toast.error(err.message || 'Failed to release settlement.');
    }
  };

  // Export CSV
  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const response = await fetch('/api/settlements/export-csv');
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Transactions exported successfully.");
    } catch (err) {
      toast.error("Failed to export transactions.");
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-8 pb-16 pt-4 px-1 flex flex-col items-center justify-center min-h-[50vh]">
        <div className="w-10 h-10 rounded-full border-2 border-slate-900 border-r-transparent animate-spin" />
        <p className="text-slate-500 text-xs font-semibold">Loading transactions...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16 pt-4 px-1">
      {/* 🚀 PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-[10px] font-semibold py-0.5 px-2.5">
              Payments: Cashfree sandbox
            </Badge>
          </div>
          <h1 className="text-[clamp(1.5rem,2.5vw,2rem)] font-display font-bold tracking-tight text-slate-950">
            Transactions
          </h1>
          <p className="text-slate-500 font-medium text-sm leading-relaxed">
            Your procurement escrow contracts and settlement history.
          </p>
        </div>

        <div>
          <Button 
            onClick={handleExportCSV}
            disabled={ledger.length === 0 || isExporting}
            variant="outline" 
            className="border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs uppercase tracking-wider h-11 px-5 rounded-xl shadow-sm gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {isExporting ? "Exporting..." : "Export CSV"}
          </Button>
        </div>
      </div>

      {/* 💻 SPLIT-PANE VIEW */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: COMMITMENT LEDGER LIST (5 cols) */}
        <div className="xl:col-span-5 space-y-6">
          <Card className="bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden flex flex-col">
            <CardHeader className="py-5 px-6 border-b border-slate-100 gap-4 bg-slate-50/20">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-950">Deals Ledger</CardTitle>
                  <CardDescription className="text-xs text-slate-400">
                    Escrow contracts and payments
                  </CardDescription>
                </div>

                {/* Filter Tabs */}
                <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
                  {(['ALL', 'SECURED', 'VERIFIED', 'SETTLED'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setStatusFilter(tab)}
                      className={`text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-md transition-all ${
                        statusFilter === tab ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-950"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search */}
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                <Input 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by supplier, category, or ID..." 
                  className="h-9 pl-9 pr-4 bg-white border-slate-200 rounded-xl focus:border-slate-400 transition-all font-semibold text-xs shadow-sm"
                />
              </div>
            </CardHeader>

            <div className="divide-y divide-slate-100 overflow-y-auto max-h-[600px]">
              {filteredLedger.map((row) => (
                <div
                  key={row.id}
                  onClick={() => setSelectedRow(row)}
                  className={`p-5 hover:bg-slate-50 transition-all cursor-pointer flex items-center justify-between gap-4 border-l-4 ${
                    selectedRow?.id === row.id ? "bg-slate-50 border-slate-950" : "border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-bold transition-all shrink-0 ${
                      selectedRow?.id === row.id ? "bg-slate-950 text-white border-slate-950" : "bg-slate-50 text-slate-600 border-slate-200"
                    }`}>
                      {(row.supplier || 'S').charAt(0)}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-950 block leading-tight">{row.supplier}</span>
                      <span className="text-[10px] text-slate-400 font-medium block mt-0.5">{row.category} • {row.region}</span>
                    </div>
                  </div>

                  <div className="text-right space-y-1 shrink-0">
                    <span className="text-xs font-bold text-slate-950 block font-mono">
                      {formatINR(row.contract_value)}
                    </span>
                    {getStatusBadge(row.status)}
                  </div>
                </div>
              ))}

              {filteredLedger.length === 0 && (
                <div className="p-12 text-center text-slate-400 text-xs font-medium">
                  {ledger.length === 0 ? "No transactions yet. Start a procurement." : "No records match your filter."}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN: ACTIVE SETTLEMENT DETAILS (7 cols) */}
        <div className="xl:col-span-7">
          {selectedRow ? (
            <Card className="bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden p-6 sm:p-8 space-y-6">
              
              {/* Console Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-5 gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-950 text-white flex items-center justify-center text-sm font-bold">
                    {(selectedRow.supplier || 'S').charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-slate-900 leading-tight">{selectedRow.supplier}</h3>
                    <span className="text-[10px] text-slate-400 font-mono tracking-wider block mt-0.5">
                      ID: {selectedRow.id}
                    </span>
                  </div>
                </div>
                <div>
                  {getStatusBadge(selectedRow.status)}
                </div>
              </div>

              {/* Main Lock Display Panel */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Escrow Commitment Value</span>
                  <h2 className="text-3xl font-bold text-slate-900 tracking-tight font-mono">
                    {formatINR(selectedRow.contract_value, true)}
                  </h2>
                </div>
              </div>

              {/* Parameters */}
              <div className="space-y-3 border-b border-slate-100 pb-5">
                <h4 className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                  Contract Parameters
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 font-medium block mb-0.5">Category</span>
                    <span className="text-slate-900 font-semibold">{selectedRow.category}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block mb-0.5">Promised Delivery</span>
                    <span className="text-slate-900 font-semibold">{selectedRow.lead_time}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block mb-0.5">Origin</span>
                    <span className="text-slate-900 font-semibold">{selectedRow.region}</span>
                  </div>
                </div>
              </div>

              {/* Operational Actions */}
              <div className="flex flex-wrap items-center gap-3 justify-end pt-2">
                {selectedRow.raw_status === 'VERIFIED' && (
                  <Button
                    onClick={() => handleReleaseSettlement(selectedRow.id)}
                    className="bg-slate-950 hover:bg-black text-white font-bold text-xs uppercase tracking-wider h-10 px-5 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" /> Release Escrow Funds
                  </Button>
                )}

                {selectedRow.raw_status === 'RELEASED' && (
                  <div className="w-full p-4 rounded-xl bg-teal-50 border border-teal-100 flex items-center gap-3 text-teal-800 text-xs font-medium">
                    <Check className="w-5 h-5 shrink-0 text-teal-600" />
                    <span>Escrow funds successfully released to supplier (simulated settlement).</span>
                  </div>
                )}
              </div>

              {/* Sourcing Timeline */}
              {selectedRow.history && selectedRow.history.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <h4 className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                    Escrow History
                  </h4>
                  <div className="space-y-3 pl-1">
                    {selectedRow.history.map((h: any, idx: number) => (
                      <div key={idx} className="flex items-start gap-3 text-xs">
                        <div className="w-2 h-2 rounded-full bg-slate-900 mt-1.5 shrink-0" />
                        <div>
                          <p className="font-semibold text-slate-900">{h.note || h.status}</p>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {h.timestamp ? new Date(h.timestamp).toLocaleString() : ''}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </Card>
          ) : (
            <div className="h-[400px] bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center p-8 text-center space-y-3">
              <FileText className="w-10 h-10 text-slate-300" />
              <div>
                <h4 className="font-bold text-slate-800 text-sm">No transaction selected</h4>
                <p className="text-xs text-slate-500 max-w-xs mt-1">
                  Select a deal from the list on the left to inspect commitment details and release funds.
                </p>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Transactions;
