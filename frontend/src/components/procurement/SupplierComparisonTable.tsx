import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  ShieldCheck, 
  Globe, 
  Clock, 
  Layers, 
  TrendingUp, 
  ArrowRight, 
  ChevronRight, 
  AlertCircle,
  Search,
  Filter,
  ArrowUpDown,
  LayoutGrid,
  List,
  CheckCircle2,
  Package
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { cn } from '../../lib/utils';

interface Supplier {
  id: number | string;
  name: string;
  product_title?: string;
  product?: string;
  product_image?: string;
  country: string;
  moq: number;
  lead_time_days: number;
  production_capacity?: number;
  trust_score: number;
  success_rate: number;
  language: string;
  negotiated_price: number;
  on_chain_verified?: boolean;
  shipping_region?: string;
  has_deviations?: boolean;
  trade_assurance?: boolean;
  verified?: boolean;
}

interface SupplierComparisonTableProps {
  suppliers: Supplier[];
  onSelect: (supplier: any) => void;
}

const SupplierComparisonTable: React.FC<SupplierComparisonTableProps> = ({ suppliers, onSelect }) => {
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'trust' | 'price' | 'lead_time'>('trust');
  const [visibleCount, setVisibleCount] = useState<number>(12);

  // Distinct regions
  const regions = useMemo(() => {
    const list = Array.from(new Set(suppliers.map(s => s.country || s.shipping_region || 'Global'))).filter(Boolean);
    return ['all', ...list];
  }, [suppliers]);

  // Filter and sort
  const filteredAndSorted = useMemo(() => {
    return suppliers
      .filter(s => {
        const matchesQuery = !searchQuery.trim() || 
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (s.product_title && s.product_title.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (s.product && s.product.toLowerCase().includes(searchQuery.toLowerCase()));
        
        const regionMatch = selectedRegion === 'all' || 
          (s.country && s.country.toLowerCase() === selectedRegion.toLowerCase()) ||
          (s.shipping_region && s.shipping_region.toLowerCase() === selectedRegion.toLowerCase());

        return matchesQuery && regionMatch;
      })
      .sort((a, b) => {
        if (sortBy === 'price') {
          return (a.negotiated_price || 0) - (b.negotiated_price || 0);
        } else if (sortBy === 'lead_time') {
          return (a.lead_time_days || 0) - (b.lead_time_days || 0);
        } else {
          return (b.trust_score || 0) - (a.trust_score || 0);
        }
      });
  }, [suppliers, searchQuery, selectedRegion, sortBy]);

  const displayedSuppliers = filteredAndSorted.slice(0, visibleCount);
  const hasMore = visibleCount < filteredAndSorted.length;

  return (
    <div className="w-full space-y-4">
      {/* FILTER & SORT TOOLBAR (wraps gracefully on mobile & laptops) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-white border border-slate-200 rounded-2xl shadow-sm">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          {/* Search */}
          <div className="relative min-w-[180px] flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              type="text"
              placeholder="Search 50+ suppliers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 text-xs pl-8 pr-3 rounded-xl border-slate-200"
            />
          </div>

          {/* Region Filter */}
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="h-8 text-xs font-semibold rounded-xl border border-slate-200 bg-white px-2.5 outline-none text-slate-700 cursor-pointer shadow-sm"
          >
            <option value="all">All Regions ({suppliers.length})</option>
            {regions.filter(r => r !== 'all').map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="h-8 text-xs font-semibold rounded-xl border border-slate-200 bg-white px-2.5 outline-none text-slate-700 cursor-pointer shadow-sm"
          >
            <option value="trust">Sort: Highest Trust Index</option>
            <option value="price">Sort: Lowest Price</option>
            <option value="lead_time">Sort: Fastest Lead Time</option>
          </select>
        </div>

        {/* View Switcher */}
        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl self-end sm:self-auto shrink-0">
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              "p-1.5 rounded-lg transition-colors cursor-pointer",
              viewMode === 'grid' ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-500 hover:text-slate-900"
            )}
            title="Card Grid View"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={cn(
              "p-1.5 rounded-lg transition-colors cursor-pointer",
              viewMode === 'table' ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-500 hover:text-slate-900"
            )}
            title="Table View"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* VIEW: RESPONSIVE CARD GRID (1 / 2 / 3 columns) */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedSuppliers.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
              className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-primary/40 transition-all flex flex-col justify-between group"
            >
              <div className="space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h4 
                      className="text-xs font-bold text-slate-900 truncate group-hover:text-primary transition-colors cursor-pointer"
                      title={s.name}
                    >
                      {s.name}
                    </h4>
                    <p className="text-[10px] text-slate-500 truncate mt-0.5 flex items-center gap-1">
                      <Globe className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{s.country || s.shipping_region || 'Global'}</span>
                    </p>
                  </div>
                  <Badge className="bg-emerald-50 text-emerald-700 border-none text-[8px] font-black uppercase shrink-0">
                    {s.trust_score}% Trust
                  </Badge>
                </div>

                {/* Product / Details */}
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5 text-[11px]">
                  <div className="flex justify-between items-center text-slate-600">
                    <span className="text-[9px] uppercase font-bold text-slate-400">Negotiated Price:</span>
                    <span className="font-bold text-emerald-600 font-mono">${s.negotiated_price.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600">
                    <span className="text-[9px] uppercase font-bold text-slate-400">Est. Lead Time:</span>
                    <span className="font-semibold text-slate-800">{s.lead_time_days} days</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600">
                    <span className="text-[9px] uppercase font-bold text-slate-400">MOQ:</span>
                    <span className="font-semibold text-slate-800">{s.moq} units</span>
                  </div>
                </div>

                {/* Verification badge */}
                <div className="flex items-center gap-1.5 text-[9px] font-semibold text-slate-500">
                  {s.trade_assurance ? (
                    <span className="text-amber-600 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Trade Assurance
                    </span>
                  ) : s.verified ? (
                    <span className="text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Verified Supplier
                    </span>
                  ) : (
                    <span className="text-slate-400">Standard Supplier</span>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 mt-3">
                <Button 
                  size="sm" 
                  onClick={() => onSelect(s)}
                  className="w-full h-8 text-[10px] font-bold uppercase tracking-wider bg-slate-900 hover:bg-primary text-white rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1"
                >
                  <span>Select Supplier</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* VIEW: TABLE VIEW (with horizontal scroll) */}
      {viewMode === 'table' && (
        <div className="w-full overflow-hidden border border-slate-200 rounded-2xl bg-white shadow-sm">
          <div className="overflow-x-auto min-w-0">
            <table className="w-full text-left border-collapse min-w-[720px]">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-[9px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-5 font-semibold">Supplier & Product</th>
                  <th className="py-3 px-3 font-semibold">Region</th>
                  <th className="py-3 px-3 font-semibold text-center">MOQ</th>
                  <th className="py-3 px-3 font-semibold text-center">Lead Time</th>
                  <th className="py-3 px-3 font-semibold text-center">Trust Index</th>
                  <th className="py-3 px-3 font-semibold text-center">Success Rate</th>
                  <th className="py-3 px-3 font-semibold">Verification</th>
                  <th className="py-3 px-3 font-semibold text-right">Negotiated Price</th>
                  <th className="py-3 px-5 font-semibold text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedSuppliers.map((s, i) => (
                  <motion.tr
                    key={s.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.02, 0.2) }}
                    className="group hover:bg-slate-50 transition-all cursor-default"
                  >
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-3">
                        {s.product_image && (
                          <div className="w-8 h-8 rounded-lg border border-slate-200 overflow-hidden shrink-0 bg-slate-50">
                            <img src={s.product_image} alt={s.product_title || s.name} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span 
                              className="text-[11px] font-bold text-slate-900 group-hover:text-primary transition-colors truncate max-w-[200px]"
                              title={s.name}
                            >
                              {s.name}
                            </span>
                            {s.has_deviations && (
                              <AlertCircle className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                            )}
                          </div>
                          <span 
                            className="text-[9px] text-slate-500 font-medium truncate max-w-[180px]"
                            title={s.product_title || s.product}
                          >
                            {s.product_title || s.product || s.language + ' Support'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1">
                        <Globe className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="text-[10px] font-bold text-slate-600 truncate">{s.country || s.shipping_region || 'Global'}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="text-[10px] font-bold text-slate-900">{s.moq}</span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={cn(
                        "text-[10px] font-bold",
                        s.lead_time_days <= 10 ? "text-emerald-600" : "text-slate-900"
                      )}>
                        {s.lead_time_days}d
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="text-[10px] font-bold text-slate-900">{s.trust_score}%</span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <Badge variant="outline" className={cn(
                        "font-black text-[8px] border-none px-1.5 py-0 rounded-md",
                        s.success_rate >= 95 ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-600"
                      )}>
                        {s.success_rate}%
                      </Badge>
                    </td>
                    <td className="py-3 px-3">
                      {s.trade_assurance ? (
                        <span className="text-[7px] font-black text-amber-600 uppercase tracking-tighter">Trade Assurance</span>
                      ) : s.verified ? (
                        <span className="text-[7px] font-black text-emerald-600 uppercase tracking-tighter">Verified</span>
                      ) : (
                        <span className="text-[7px] font-black text-slate-400 uppercase tracking-tighter">Standard</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="text-[11px] font-bold text-slate-900 font-mono">${s.negotiated_price.toLocaleString()}</span>
                    </td>
                    <td className="py-3 px-5 text-center">
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => onSelect(s)}
                        className="h-7 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-lg transition-all cursor-pointer"
                      >
                        <span className="text-[9px] font-black uppercase tracking-widest mr-1">Proceed</span>
                        <ChevronRight className="w-3 h-3" />
                      </Button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* "LOAD MORE" BATCH BUTTON FOR 50+ SUPPLIERS */}
      {hasMore && (
        <div className="flex flex-col items-center justify-center pt-2 gap-1.5">
          <Button
            variant="outline"
            onClick={() => setVisibleCount(prev => prev + 12)}
            className="rounded-xl border-slate-200 text-xs font-bold px-6 py-2 hover:bg-slate-50 cursor-pointer shadow-xs"
          >
            Load More Suppliers (+12)
          </Button>
          <p className="text-[10px] text-slate-400 font-medium">
            Showing {displayedSuppliers.length} of {filteredAndSorted.length} matching suppliers
          </p>
        </div>
      )}

      {filteredAndSorted.length === 0 && (
        <div className="p-8 text-center text-slate-400 font-medium text-xs bg-white rounded-2xl border border-slate-200">
          No suppliers found matching your search or filters.
        </div>
      )}
    </div>
  );
};

export default SupplierComparisonTable;
