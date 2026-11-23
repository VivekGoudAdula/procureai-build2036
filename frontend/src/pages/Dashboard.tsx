import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { 
  ArrowRight,
  ShieldCheck,
  Radio,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  Globe
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { formatINR } from '../lib/utils';

export default function Dashboard() {
  const { user } = useApp();
  const [rfqsCount, setRfqsCount] = useState<number>(0);
  const [awaitingPaymentCount, setAwaitingPaymentCount] = useState<number>(0);
  const [inProgressCount, setInProgressCount] = useState<number>(0);
  const [completedCount, setCompletedCount] = useState<number>(0);
  const [refundedCount, setRefundedCount] = useState<number>(0);
  const [ordersByCountry, setOrdersByCountry] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchDashboardData = async () => {
    try {
      const [resAnalytics, resFeed] = await Promise.all([
        fetch('/api/dashboard/analytics').then(r => r.ok ? r.json() : null),
        fetch('/api/dashboard/procurement-feed').then(r => r.ok ? r.json() : null)
      ]);

      if (resAnalytics) {
        setRfqsCount(resAnalytics.rfqs_count ?? 0);
        setAwaitingPaymentCount(resAnalytics.awaiting_payment_count ?? 0);
        setInProgressCount(resAnalytics.in_progress_count ?? 0);
        setCompletedCount(resAnalytics.completed_count ?? 0);
        setRefundedCount(resAnalytics.refunded_count ?? 0);
        setOrdersByCountry(resAnalytics.orders_by_country || []);
      }

      if (Array.isArray(resFeed)) {
        setRecentActivity(resFeed);
      }
    } catch (err) {
      console.error("Error loading dashboard data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 10000);
    return () => clearInterval(interval);
  }, []);

  const formatRelativeTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return String(isoString);
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-8 pb-16 pt-4 px-1">
      {/* 🚀 DASHBOARD HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-[10px] font-semibold py-0.5 px-2.5">
              Payments: Cashfree sandbox
            </Badge>
            {refundedCount > 0 && (
              <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] font-semibold py-0.5 px-2.5">
                {refundedCount} Refunded
              </Badge>
            )}
          </div>
          <h1 className="text-[clamp(1.5rem,2.5vw,2rem)] font-display font-bold tracking-tight text-slate-950">
            Dashboard
          </h1>
          <p className="text-slate-500 font-medium text-sm leading-relaxed">
            Your procurement activity.
          </p>
        </div>

        <div>
          <Link to="/procurement">
            <Button className="bg-slate-950 hover:bg-black text-white font-bold text-xs uppercase tracking-wider h-11 px-6 rounded-xl shadow-md transition-all hover:scale-[1.02]">
              Launch Sourcing Engine <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* ✅ 4 PRIMARY METRICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* CARD 1: RFQs Sent */}
        <Card className="bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden hover:border-slate-300 transition-all">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50 text-blue-600 border border-blue-100">
                <FileText className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Inquiries
              </span>
            </div>
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-slate-500">RFQs sent</h3>
              <div className="text-2xl font-bold tracking-tight text-slate-950">
                {rfqsCount}
              </div>
              <p className="text-[11px] text-slate-400">Total requests for quotation sent</p>
            </div>
          </CardContent>
        </Card>

        {/* CARD 2: Awaiting Payment */}
        <Card className="bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden hover:border-slate-300 transition-all">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-50 text-amber-600 border border-amber-100">
                <Clock className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Action Pending
              </span>
            </div>
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-slate-500">Awaiting payment</h3>
              <div className="text-2xl font-bold tracking-tight text-slate-950">
                {awaitingPaymentCount}
              </div>
              <p className="text-[11px] text-slate-400">Escrow commitments initialized</p>
            </div>
          </CardContent>
        </Card>

        {/* CARD 3: In Progress */}
        <Card className="bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden hover:border-slate-300 transition-all">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-50 text-indigo-600 border border-indigo-100">
                <Radio className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Active
              </span>
            </div>
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-slate-500">In progress</h3>
              <div className="text-2xl font-bold tracking-tight text-slate-950">
                {inProgressCount}
              </div>
              <p className="text-[11px] text-slate-400">Funded, awaiting proof or verification</p>
            </div>
          </CardContent>
        </Card>

        {/* CARD 4: Completed */}
        <Card className="bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden hover:border-slate-300 transition-all">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-600 border border-emerald-100">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Settled
              </span>
            </div>
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-slate-500">Completed</h3>
              <div className="text-2xl font-bold tracking-tight text-slate-950">
                {completedCount}
              </div>
              <p className="text-[11px] text-slate-400">Escrow funds released to supplier</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 💻 MAIN SECTIONS: ORDERS BY COUNTRY & RECENT ACTIVITY */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* LEFT COLUMN: ORDERS BY SUPPLIER COUNTRY (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="py-5 px-6 border-b border-slate-100 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold text-slate-950 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-slate-700" />
                  Orders by supplier country
                </CardTitle>
                <CardDescription className="text-xs text-slate-400 mt-0.5">
                  Count of your procurement deals grouped by supplier origin
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {ordersByCountry.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  <Globe className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  No orders yet. Start a procurement.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="h-[240px] w-full min-w-0">
                    <ResponsiveContainer width="100%" height={240} minWidth={0}>
                      <BarChart data={ordersByCountry}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                          dy={6}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                          allowDecimals={false}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: '#fff', 
                            borderRadius: '12px', 
                            border: '1px solid #e2e8f0',
                            padding: '10px'
                          }}
                        />
                        <Bar 
                          dataKey="deals" 
                          name="Deals" 
                          fill="#0f172a" 
                          radius={[4, 4, 0, 0]} 
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="divide-y divide-slate-100 border-t border-slate-100 pt-2">
                    {ordersByCountry.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between py-2 text-xs">
                        <span className="font-semibold text-slate-800">{item.name}</span>
                        <span className="font-mono text-slate-500">{item.deals} deal{item.deals > 1 ? 's' : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN: RECENT ACTIVITY (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="py-5 px-6 border-b border-slate-100">
              <CardTitle className="text-base font-semibold text-slate-950 flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-700" />
                Recent activity
              </CardTitle>
              <CardDescription className="text-xs text-slate-400 mt-0.5">
                Real escrow milestones and RFQ dispatches
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              {recentActivity.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  <FileText className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  No activity yet. Start a procurement.
                </div>
              ) : (
                <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
                  {recentActivity.map((activity, idx) => (
                    <div 
                      key={activity.id || idx}
                      className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-semibold text-slate-900 leading-snug">
                          {activity.title || activity.event}
                        </h4>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap font-mono shrink-0">
                          {formatRelativeTime(activity.timestamp)}
                        </span>
                      </div>
                      {activity.supplier && (
                        <p className="text-[11px] text-slate-500 mt-1">
                          Supplier: {activity.supplier}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
