import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import { 
  BarChart3, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  Layers, 
  Download, 
  Globe, 
  Sparkles,
  AlertCircle,
  FileSpreadsheet
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { formatINR, formatLakhCrore } from '../lib/utils';

export default function Analytics() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const fetchAnalytics = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/procurement/analytics`);
      if (response.data) {
        setData(response.data);
      }
    } catch (err: any) {
      console.warn("Analytics load error:", err?.response?.data || err?.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/settlements/export-csv`, {
        responseType: 'blob'
      });
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `deals_export_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Deals exported successfully as CSV.");
    } catch (err) {
      toast.error("Failed to export deals.");
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading || !data) {
    return (
      <div className="space-y-8 pb-16 pt-4 px-1 flex flex-col items-center justify-center min-h-[50vh]">
        <div className="w-10 h-10 rounded-full border-2 border-slate-900 border-r-transparent animate-spin" />
        <p className="text-slate-500 text-xs font-semibold">Loading analytics...</p>
      </div>
    );
  }

  const kpis = data.kpis || {};
  const dealOutcomes = data.deal_outcomes || { completed: 0, in_progress: 0, awaiting_payment: 0, refunded: 0, total_deals: 0 };
  const globalTrends = data.global_trends || [];
  const regionalData = data.regional_sourcing_intelligence || [];
  const categoryData = data.procurement_category_intelligence || [];
  const insights = data.ai_procurement_insights || [];
  const hasDeals = (kpis.deals_count || 0) > 0;

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
            Analytics
          </h1>
          <p className="text-slate-500 font-medium text-sm leading-relaxed">
            Your procurement and settlement analytics.
          </p>
        </div>

        <div>
          <Button 
            onClick={handleExportCSV}
            disabled={!hasDeals || isExporting}
            className="bg-slate-950 hover:bg-black text-white font-bold text-xs uppercase tracking-wider h-11 px-5 rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {isExporting ? "Exporting..." : "Export deals (CSV)"}
          </Button>
        </div>
      </div>

      {/* ✅ REAL PROCUREMENT KPIs (₹) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* CARD 1: Total Procurement Value */}
        <Card className="bg-white border-slate-200 shadow-sm rounded-2xl p-6 hover:border-slate-300 transition-all">
          <div className="flex justify-between items-start mb-3">
            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-200 text-slate-900">
              <span className="font-bold text-base">₹</span>
            </div>
            <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-[9px] font-bold py-0.5 px-2">
              VOLUME
            </Badge>
          </div>
          <p className="text-xs font-semibold text-slate-500">
            Total procurement value
          </p>
          <h3 className="text-2xl font-bold mt-1 tracking-tight text-slate-950">
            {formatLakhCrore(kpis.total_procurement_volume_inr)}
          </h3>
          <p className="text-[11px] text-slate-400 mt-1">
            {formatINR(kpis.total_procurement_volume_inr, true)} across funded deals
          </p>
        </Card>

        {/* CARD 2: Deals & Completion Rate */}
        <Card className="bg-white border-slate-200 shadow-sm rounded-2xl p-6 hover:border-slate-300 transition-all">
          <div className="flex justify-between items-start mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center border border-emerald-100 text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] font-bold py-0.5 px-2">
              COMPLETION
            </Badge>
          </div>
          <p className="text-xs font-semibold text-slate-500">
            Deals completed rate
          </p>
          <h3 className="text-2xl font-bold mt-1 tracking-tight text-slate-950">
            {kpis.completed_rate ?? 0}%
          </h3>
          <p className="text-[11px] text-slate-400 mt-1">
            {dealOutcomes.completed} released / {dealOutcomes.total_deals} total deals
          </p>
        </Card>

        {/* CARD 3: Average Lead Time */}
        <Card className="bg-white border-slate-200 shadow-sm rounded-2xl p-6 hover:border-slate-300 transition-all">
          <div className="flex justify-between items-start mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-100 text-blue-600">
              <Clock className="w-5 h-5" />
            </div>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[9px] font-bold py-0.5 px-2">
              LEAD TIME
            </Badge>
          </div>
          <p className="text-xs font-semibold text-slate-500">
            Avg promised lead time
          </p>
          <h3 className="text-2xl font-bold mt-1 tracking-tight text-slate-950">
            {kpis.avg_lead_time_days ? `${kpis.avg_lead_time_days} days` : '0 days'}
          </h3>
          <p className="text-[11px] text-slate-400 mt-1">
            Promised fulfillment duration across deals
          </p>
        </Card>

        {/* CARD 4: Suppliers Used / Savings */}
        <Card className="bg-white border-slate-200 shadow-sm rounded-2xl p-6 hover:border-slate-300 transition-all">
          <div className="flex justify-between items-start mb-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-100 text-indigo-600">
              <Globe className="w-5 h-5" />
            </div>
            <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[9px] font-bold py-0.5 px-2">
              SUPPLIERS
            </Badge>
          </div>
          <p className="text-xs font-semibold text-slate-500">
            Suppliers used
          </p>
          <h3 className="text-2xl font-bold mt-1 tracking-tight text-slate-950">
            {kpis.suppliers_used ?? 0}
          </h3>
          <p className="text-[11px] text-slate-400 mt-1">
            {kpis.savings ? kpis.savings : "Savings: Not enough data"}
          </p>
        </Card>
      </div>

      {/* 📊 MONTHLY TREND CHART & DEAL OUTCOMES PANEL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* MONTHLY TREND CHART (8 cols) */}
        <Card className="lg:col-span-8 bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden flex flex-col">
          <CardHeader className="py-5 px-6 border-b border-slate-100">
            <CardTitle className="text-base font-semibold text-slate-950 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-slate-700" />
              Monthly procurement value (₹)
            </CardTitle>
            <CardDescription className="text-xs text-slate-400 mt-0.5">
              Escrow commitments grouped by month
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 flex-1 flex flex-col justify-center">
            {globalTrends.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-sm">
                No monthly trend data available.
              </div>
            ) : (
              <div className="h-[280px] w-full min-w-0">
                <ResponsiveContainer width="100%" height={280} minWidth={0}>
                  <AreaChart data={globalTrends}>
                    <defs>
                      <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0f172a" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#0f172a" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="month" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                      dy={8}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                      tickFormatter={(val) => formatLakhCrore(val)}
                    />
                    <Tooltip 
                      formatter={(val: any) => [formatINR(val, true), "Value"]}
                      contentStyle={{ 
                        backgroundColor: '#fff', 
                        borderRadius: '12px', 
                        border: '1px solid #e2e8f0',
                        padding: '10px'
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="sourcing_volume" 
                      name="Value (₹)"
                      stroke="#0f172a" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#trendGrad)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 🎯 DEAL OUTCOMES PANEL (4 cols) */}
        <Card className="lg:col-span-4 bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden p-6 flex flex-col justify-between">
          <div className="space-y-5">
            <div>
              <CardTitle className="text-base font-semibold text-slate-950 flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-700" />
                Deal outcomes
              </CardTitle>
              <CardDescription className="text-xs text-slate-400 mt-0.5">
                Distribution across your escrow contracts
              </CardDescription>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/60 border border-emerald-100">
                <span className="text-xs font-semibold text-emerald-900">Completed</span>
                <span className="text-sm font-bold text-emerald-950 font-mono">{dealOutcomes.completed}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50/60 border border-blue-100">
                <span className="text-xs font-semibold text-blue-900">In Progress</span>
                <span className="text-sm font-bold text-blue-950 font-mono">{dealOutcomes.in_progress}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50/60 border border-amber-100">
                <span className="text-xs font-semibold text-amber-900">Awaiting Payment</span>
                <span className="text-sm font-bold text-amber-950 font-mono">{dealOutcomes.awaiting_payment}</span>
              </div>

              {dealOutcomes.refunded > 0 && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-rose-50/60 border border-rose-100">
                  <span className="text-xs font-semibold text-rose-900">Refunded</span>
                  <span className="text-sm font-bold text-rose-950 font-mono">{dealOutcomes.refunded}</span>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 mt-6">
            <p className="text-[11px] text-slate-400 font-medium">
              Total Recorded Deals: <span className="font-bold text-slate-700 font-mono">{dealOutcomes.total_deals}</span>
            </p>
          </div>
        </Card>
      </div>

      {/* 🌍 REGIONAL BREAKDOWN & CATEGORY TABLE */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Regional Table */}
        <Card className={categoryData.length > 0 ? "xl:col-span-6 bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden" : "xl:col-span-12 bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden"}>
          <CardHeader className="py-5 px-6 border-b border-slate-100">
            <CardTitle className="text-base font-semibold text-slate-950 flex items-center gap-2">
              <Globe className="w-4 h-4 text-slate-700" />
              Orders by country
            </CardTitle>
            <CardDescription className="text-xs text-slate-400 mt-0.5">
              Deals, total ₹ volume, and average lead time by supplier origin
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {regionalData.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                No country breakdown available yet.
              </div>
            ) : (
              <div className="overflow-x-auto min-w-0">
                <table className="w-full text-left border-collapse min-w-[500px]">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                      <th className="py-3 px-6">Country</th>
                      <th className="py-3 px-6 text-center">Deals</th>
                      <th className="py-3 px-6 text-right">Total (₹)</th>
                      <th className="py-3 px-6 text-right">Avg Lead Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {regionalData.map((row: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="py-3.5 px-6 font-semibold text-slate-900">{row.region}</td>
                        <td className="py-3.5 px-6 text-center font-mono text-slate-600">{row.deals}</td>
                        <td className="py-3.5 px-6 text-right font-mono font-semibold text-slate-900">{formatINR(row.total_inr, true)}</td>
                        <td className="py-3.5 px-6 text-right text-slate-500">{row.avg_lead_time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category Table (rendered only if real categories exist) */}
        {categoryData.length > 0 && (
          <Card className="xl:col-span-6 bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="py-5 px-6 border-b border-slate-100">
              <CardTitle className="text-base font-semibold text-slate-950 flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-700" />
                Product categories
              </CardTitle>
              <CardDescription className="text-xs text-slate-400 mt-0.5">
                Breakdown by purchased product category
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto min-w-0">
                <table className="w-full text-left border-collapse min-w-[400px]">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                      <th className="py-3 px-6">Category</th>
                      <th className="py-3 px-6 text-center">Deals</th>
                      <th className="py-3 px-6 text-right">Total (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {categoryData.map((cat: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="py-3.5 px-6 font-semibold text-slate-900">{cat.category}</td>
                        <td className="py-3.5 px-6 text-center font-mono text-slate-600">{cat.deals_count}</td>
                        <td className="py-3.5 px-6 text-right font-mono font-semibold text-slate-900">{formatINR(cat.total_inr, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 🧠 RULE-BASED INSIGHTS (Shown only if user has deals) */}
      {insights.length > 0 && (
        <Card className="bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="py-5 px-6 border-b border-slate-100 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-slate-950 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-slate-700" />
                Based on your deals
              </CardTitle>
              <CardDescription className="text-xs text-slate-400 mt-0.5">
                Rule-based summaries computed from your procurement history
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-3">
            {insights.map((insight: string, idx: number) => (
              <div 
                key={idx}
                className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50/70 border border-slate-100 text-xs text-slate-800"
              >
                <div className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0 text-[10px] font-bold">
                  {idx + 1}
                </div>
                <p className="leading-relaxed font-medium">{insight}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
