import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Search,
  Cpu,
  MessageSquare,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Zap,
  TrendingDown,
  ExternalLink,
  ChevronRight,
  DollarSign,
  Layers,
  Clock,
  Lock,
  FileText,
  Image as ImageIcon,
  Eye,
  Trash2,
  FileUp,
  Upload,
  Settings,
  Shield,
  Activity,
  Truck,
  Percent,
  Check,
  Package,
  Globe,
  Mail,
  Languages,
  Info,
  Download,
  RefreshCw,
  MoreVertical,
  Database,
  Sparkles,
  Star,
  Mic,
  Send
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { load as loadCashfree } from '@cashfreepayments/cashfree-js';
import IntelligenceLoading from '../components/procurement/IntelligenceLoading';
import SupplierIntelligenceDashboard from '../components/procurement/SupplierIntelligenceDashboard';
import { useApp } from '../context/AppContext';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';

import { API_BASE_URL } from '../config';


interface Supplier {
  id: number;
  name: string;
  price: number;
  rating: number;
  deliveryTime: string;
  reliability: number;
  success_rate: number;
  score: number;
  total_deals?: number;
  successful_deals?: number;
  failed_deals?: number;
  on_time_deliveries?: number;
  late_deliveries?: number;
  reputation_hash?: string;
  last_updated?: string;
}

interface Log {
  role: 'agent' | 'supplier';
  message: string;
}

interface ProcurementResult {
  suppliers: Supplier[];
  negotiationLogs: Log[];
  selectedSupplier: {
    id: number;
    name: string;
    finalPrice: number;
    reasoning: string;
    unit_price: number;
    reliability: number;
    deliveryTime: string;
  };
  status?: string;
  reason?: string;
  policy_applied?: boolean;
  filtered_out_count?: number;
  rejection_reasons?: Array<{ supplier: string; reasons: string[] }>;
}

interface IntelligenceResult {
  suppliers: any[];
  recommended_supplier: any;
  recommended_suppliers?: any[];
  procurement_analysis: any;
  rejected_suppliers: any[];
}

const Procurement = () => {
  const { addTransaction, user } = useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Form State (survives page reloads via sessionStorage)
  const [productName, setProductName] = useState<string>(() => {
    return sessionStorage.getItem('procureai_productName') || '';
  });
  const [quantity, setQuantity] = useState<number>(() => {
    const saved = sessionStorage.getItem('procureai_quantity');
    return saved ? Number(saved) : 1;
  });
  const [budget, setBudget] = useState<number>(() => {
    const saved = sessionStorage.getItem('procureai_budget');
    return saved ? Number(saved) : 1000;
  });
  const [shippingRegion, setShippingRegion] = useState<string>(() => {
    return sessionStorage.getItem('procureai_shippingRegion') || 'Global';
  });
  const [customRequirements, setCustomRequirements] = useState<string>(() => {
    return sessionStorage.getItem('procureai_customRequirements') || '';
  });
  const [leadTime, setLeadTime] = useState<string>(() => {
    return sessionStorage.getItem('procureai_leadTime') || '30 Days';
  });

  // Policy Engine State
  const [enablePolicy, setEnablePolicy] = useState(false);
  const [minReliability, setMinReliability] = useState<number>(80);
  const [maxDeliveryDays, setMaxDeliveryDays] = useState<number>(7);
  const [minSuccessRate, setMinSuccessRate] = useState<number>(85);
  const [requireVerified, setRequireVerified] = useState(false);
  const [escrowRecord, setEscrowRecord] = useState<any>(null);

  // State Persistence Logic ( survives page reloads )
  const [step, setStep] = useState<'form' | 'intelligence_loading' | 'intelligence_dashboard' | 'communication' | 'escrow_locked' | 'payment'>(() => {
    return (sessionStorage.getItem('procureai_step') as any) || 'form';
  });
  const [intelligenceResult, setIntelligenceResult] = useState<IntelligenceResult | null>(() => {
    const saved = sessionStorage.getItem('procureai_intelligence');
    return saved ? JSON.parse(saved) : null;
  });
  const [procurementLogs, setProcurementLogs] = useState<string[]>([]);
  const [showTerminal, setShowTerminal] = useState(false);
  const [result, setResult] = useState<ProcurementResult | null>(() => {
    const saved = sessionStorage.getItem('procureai_result');
    return saved ? JSON.parse(saved) : null;
  });
  const [txId, setTxId] = useState<string | null>(() => {
    return sessionStorage.getItem('procureai_txid');
  });
  const [appId, setAppId] = useState<number | null>(() => {
    const saved = sessionStorage.getItem('procureai_appid');
    return saved ? parseInt(saved) : null;
  });
  const [appAddress, setAppAddress] = useState<string | null>(() => {
    return sessionStorage.getItem('procureai_appaddress');
  });


  // UI State
  const [isSearching, setIsSearching] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentPhase, setPaymentPhase] = useState(0);

  // Delivery Verification State
  const [proofType, setProofType] = useState<'invoice_file' | 'timestamp' | 'tracking_id'>('invoice_file');
  const [proofValue, setProofValue] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [isSubmittingProof, setIsSubmittingProof] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [showSupplierDetails, setShowSupplierDetails] = useState<Supplier | null>(null);
  const [escrowStatus, setEscrowStatus] = useState<string>(() => {
    return sessionStorage.getItem('procureai_escrowstatus') || 'created';
  });

  // Cashfree Sandbox Payment State
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [isPayingCashfree, setIsPayingCashfree] = useState<boolean>(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Automated Audit State
  const [auditResult, setAuditResult] = useState<{
    status: 'completed' | 'unavailable';
    looks_like_invoice: boolean;
    extracted: {
      invoice_no?: string | null;
      date?: string | null;
      amount?: number | null;
      supplier_name?: string | null;
    };
    mismatches: string[];
    message: string;
  } | null>(null);
  const [isAuditing, setIsAuditing] = useState<boolean>(false);

  // Communication & RFQ State
  const [inquiryData, setInquiryData] = useState<any>(null);
  const [isSendingInquiry, setIsSendingInquiry] = useState(false);
  const [inquirySent, setInquirySent] = useState(false);
  const [selectedSupplierForComm, setSelectedSupplierForComm] = useState<any>(() => {
    const saved = sessionStorage.getItem('procureai_selectedSupplierForComm');
    return saved ? JSON.parse(saved) : null;
  });
  const [rfqId, setRfqId] = useState<string | null>(null);
  const [rfqFilename, setRfqFilename] = useState<string | null>(null);
  const [isGeneratingRfq, setIsGeneratingRfq] = useState<boolean>(false);
  const [isSendingRfq, setIsSendingRfq] = useState<boolean>(false);
  const [rfqSentStatus, setRfqSentStatus] = useState<{ status: string; message: string } | null>(null);
  const [isViewingPdf, setIsViewingPdf] = useState<boolean>(false);
  const [chatTargetLanguage, setChatTargetLanguage] = useState<string>('hi');
  const [availableLanguages, setAvailableLanguages] = useState<Array<{ code: string; label: string; flag: string }>>([
    { code: 'hi', label: 'Hindi', flag: '🇮🇳' },
    { code: 'zh', label: 'Chinese', flag: '🇨🇳' },
    { code: 'vi', label: 'Vietnamese', flag: '🇻🇳' },
    { code: 'es', label: 'Spanish', flag: '🇪🇸' },
    { code: 'ja', label: 'Japanese', flag: '🇯🇵' },
    { code: 'en', label: 'English', flag: '🇬🇧' },
  ]);

  // Chat State
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Supplier Rating State
  const [rating, setRating] = useState<number>(0);
  const [review, setReview] = useState<string>('');
  const [ratingSubmitted, setRatingSubmitted] = useState<boolean>(false);
  const [isSubmittingRating, setIsSubmittingRating] = useState<boolean>(false);

  // Sync state to session storage
  useEffect(() => {
    sessionStorage.setItem('procureai_step', step);
    if (productName) sessionStorage.setItem('procureai_productName', productName);
    sessionStorage.setItem('procureai_quantity', quantity.toString());
    sessionStorage.setItem('procureai_budget', budget.toString());
    sessionStorage.setItem('procureai_shippingRegion', shippingRegion);
    if (customRequirements) sessionStorage.setItem('procureai_customRequirements', customRequirements);
    sessionStorage.setItem('procureai_leadTime', leadTime);
    if (result) sessionStorage.setItem('procureai_result', JSON.stringify(result));
    if (intelligenceResult) sessionStorage.setItem('procureai_intelligence', JSON.stringify(intelligenceResult));
    if (selectedSupplierForComm) sessionStorage.setItem('procureai_selectedSupplierForComm', JSON.stringify(selectedSupplierForComm));
    if (txId) sessionStorage.setItem('procureai_txid', txId);
    if (appId) sessionStorage.setItem('procureai_appid', appId.toString());
    if (appAddress) sessionStorage.setItem('procureai_appaddress', appAddress);
    if (escrowStatus) sessionStorage.setItem('procureai_escrowstatus', escrowStatus);

    // Clear session if we go back to form
    if (step === 'form') {
      sessionStorage.removeItem('procureai_result');
      sessionStorage.removeItem('procureai_txid');
      sessionStorage.removeItem('procureai_appid');
      sessionStorage.removeItem('procureai_appaddress');
      sessionStorage.removeItem('procureai_escrowstatus');
      sessionStorage.removeItem('procureai_selectedSupplierForComm');
    }
  }, [step, productName, quantity, budget, shippingRegion, customRequirements, leadTime, result, intelligenceResult, selectedSupplierForComm, txId, appId, appAddress, escrowStatus]);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  // Redundant reconnectSession removed to prevent double-initialization conflicts with AppContext.tsx

  /**
   * Auto-trigger escrow commitment when user returns from PremiumReport
   * with ?commit=true query param set (after reading the unlocked report).
   */
  useEffect(() => {
    const shouldCommit = searchParams.get('commit') === 'true';
    if (!shouldCommit) return;

    // Remove the query param so a refresh doesn't re-trigger
    setSearchParams({}, { replace: true });

    // Restore the previously selected supplier from sessionStorage
    const savedResult = sessionStorage.getItem('procureai_result');
    if (savedResult) {
      const parsed = JSON.parse(savedResult);
      if (parsed?.selectedSupplier) {
        handleExecuteDealFromSelection(parsed.selectedSupplier);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Handle Cashfree return URL (?order_id=)
   */
  useEffect(() => {
    const orderId = searchParams.get('order_id');
    if (orderId) {
      const effectiveEscrowId = txId || (orderId.startsWith('CF_') ? orderId.slice(3) : orderId);
      if (effectiveEscrowId) {
        if (!txId) setTxId(effectiveEscrowId);
        const verifyCashfree = async () => {
          try {
            const token = localStorage.getItem('token') || localStorage.getItem('procureai_token');
            const res = await axios.post(
              `${API_BASE_URL}/api/payments/cashfree/verify`,
              { escrow_id: effectiveEscrowId },
              { headers: token ? { Authorization: `Bearer ${token}` } : {} }
            );
            if (res.data.funded) {
              setEscrowStatus('funded');
              if (res.data.escrow) setEscrowRecord(res.data.escrow);
              setStep('escrow_locked');
              toast.success('Payment received via Cashfree (sandbox)');
            } else {
              setPaymentError('Payment not completed');
            }
          } catch (err: any) {
            console.error('[Cashfree Verify Error]', err);
            setPaymentError(err.response?.data?.detail || 'Payment not completed');
          }
        };
        verifyCashfree();
      }
    }
  }, [searchParams]);

  // Fetch supported languages for negotiation / chat
  useEffect(() => {
    const fetchLanguages = async () => {
      try {
        const token = localStorage.getItem('access_token') || localStorage.getItem('token');
        const res = await axios.get(`${API_BASE_URL}/api/negotiation/languages`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (Array.isArray(res.data) && res.data.length > 0) {
          const codeMap: Record<string, string> = {
            chinese: 'zh',
            vietnamese: 'vi',
            spanish: 'es',
            hindi: 'hi',
            japanese: 'ja',
            english: 'en'
          };
          const mapped = res.data.map((item: any) => ({
            code: codeMap[item.language?.toLowerCase()] || item.code || item.language?.toLowerCase()?.slice(0, 2) || 'en',
            label: item.language,
            flag: item.flag || '🌐'
          }));
          setAvailableLanguages(mapped);
        }
      } catch (e) {
        // Fall back gracefully to static array with Hindi
      }
    };
    fetchLanguages();
  }, []);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [result?.negotiationLogs]);

  const streamLogs = async (logs: string[]) => {
    for (const log of logs) {
      await new Promise(res => setTimeout(res, 600 + Math.random() * 600));
      setProcurementLogs(prev => [...prev, `[PROCURE-AI] ${log}`]);
    }
  };

  const handleSubmitRating = async () => {
    if (rating === 0) {
      toast.error('Please select a rating');
      return;
    }

    if (!result?.selectedSupplier?.id || !txId) {
      toast.error('Missing transaction information');
      return;
    }

    setIsSubmittingRating(true);

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE_URL}/api/ratings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          transaction_id: txId,
          supplier_id: result.selectedSupplier.id.toString(),
          buyer_id: user?.email || 'anonymous',
          rating: rating,
          review: review,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to submit rating');
      }

      const data = await response.json();
      toast.success('Rating submitted successfully');
      setRatingSubmitted(true);

      // Future Recommendation Score:
      // Recommendation Score = AI Supplier Intelligence Score + Supplier Reputation Score
      // This rating data will later be used by supplier ranking and recommendation modules.
    } catch (error) {
      console.error('Error submitting rating:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to submit rating');
    } finally {
      setIsSubmittingRating(false);
    }
  };

  const handleFindSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSearching(true);
    setStep('intelligence_loading');
    setError(null);
    setProcurementLogs([]);

    try {
      // 1. Run Global Intelligence Scan
      const response = await axios.post(`${API_BASE_URL}/api/procurement/intelligence`, {
        product_name: productName,
        quantity,
        budget,
        shipping_region: shippingRegion,
        procurement_policy: enablePolicy ? {
          min_reliability: minReliability,
          max_delivery_days: maxDeliveryDays,
          min_success_rate: minSuccessRate,
          require_verified: requireVerified
        } : null
      });

      setIntelligenceResult(response.data);
      
      // 2. Stream Intelligence Logs
      const intelLogs = response.data.logs || [];
      for (const log of intelLogs) {
        await new Promise(res => setTimeout(res, 400));
        setProcurementLogs(prev => [...prev, log]);
      }
      
      // Small final buffer
      await new Promise(res => setTimeout(res, 1000));

      setShowTerminal(true);
      setStep('intelligence_dashboard');
      toast.success('Secure Procurement Session Established!');
    } catch (err: any) {
      console.error('[ProcureAI] Intelligence Error:', err);
      setError(`Failed to fetch intelligence: ${err.message || 'Check backend connection.'}`);
      setStep('form');
      toast.error('Procurement scan failed.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectIntelligenceSupplier = async (supplier: any) => {
    // Human approval logs
    const approvalLogs = [
      "Human procurement approval received.",
      "Supplier partnership authorized.",
      "Negotiation lifecycle finalized.",
      "Preparing procurement commitment..."
    ];
    
    // Non-blocking logs
    streamLogs(approvalLogs);

    try {
      // Call backend to select supplier
      const response = await axios.post(`${API_BASE_URL}/api/procurement/select-supplier`, {
        supplier_id: supplier.id,
        session_id: "DEMO-SESSION"
      });
      console.log("[ProcureAI] Select Supplier Response:", response.data);
    } catch (err) {
      console.error("[ProcureAI] Failed to notify backend of selection", err);
    }

    // Map intelligence supplier to the format expected by the escrow flow
    const selected = {
      id: supplier.id,
      name: supplier.name,
      finalPrice: supplier.negotiated_price * quantity,
      unit_price: supplier.negotiated_price,
      deliveryTime: `${supplier.lead_time_days} Days`,
      reliability: supplier.trust_score,
      reasoning: "AI recommended based on optimal price and trust index."
    };

    setResult({
      suppliers: intelligenceResult?.suppliers.map(s => ({
        ...s,
        price: s.negotiated_price,
        deliveryTime: `${s.lead_time_days} days`,
        reliability: s.trust_score,
        rating: s.rating,
        success_rate: s.success_rate
      })) || [],
      selectedSupplier: selected,
      negotiationLogs: [
        { role: 'agent', message: "System scan complete. Evaluating candidates..." },
        { role: 'supplier', message: `Best offer: $${supplier.negotiated_price} per unit.` }
      ]
    });

    const resolvedProduct = (productName && productName.trim())
      || sessionStorage.getItem('procureai_productName')
      || supplier.product
      || supplier.product_name
      || (intelligenceResult as any)?.product_name
      || (intelligenceResult as any)?.procurement_analysis?.product
      || "Industrial Automation Equipment";

    if (!productName && resolvedProduct) {
      setProductName(resolvedProduct);
    }

    const supplierWithContext = {
      ...supplier,
      product: resolvedProduct,
      product_name: resolvedProduct,
      email: supplier.email || `contact@${(supplier.name || 'supplier').toLowerCase().replace(/[^a-z0-9]/g, '')}.com`
    };
    setSelectedSupplierForComm(supplierWithContext);
    setRfqId(null);
    setRfqFilename(null);
    setRfqSentStatus(null);
    setIsGeneratingRfq(false);
    setIsSendingRfq(false);
    setIsViewingPdf(false);
    const region = (supplier.region || supplier.country || '').toLowerCase();
    if (region.includes('india')) {
      setChatTargetLanguage('hi');
    } else if (region.includes('china')) {
      setChatTargetLanguage('zh');
    } else if (region.includes('vietnam')) {
      setChatTargetLanguage('vi');
    } else if (region.includes('mexico') || region.includes('spain')) {
      setChatTargetLanguage('es');
    } else if (region.includes('japan')) {
      setChatTargetLanguage('ja');
    } else {
      setChatTargetLanguage('hi');
    }
    setStep('communication');
  };

  const formatErrorMessage = (err: any, fallback: string): string => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      return detail.map((d: any) => (typeof d === 'string' ? d : d.msg || JSON.stringify(d))).join(', ');
    }
    if (detail && typeof detail === 'object') {
      return detail.msg || detail.message || JSON.stringify(detail);
    }
    return err?.message || fallback;
  };

  const handleGenerateRfq = async () => {
    if (!selectedSupplierForComm) return;
    setIsGeneratingRfq(true);
    setRfqSentStatus(null);
    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      const supplierId = String(selectedSupplierForComm.id || selectedSupplierForComm._id || selectedSupplierForComm.supplier_id || 'supp_1');
      const supplierName = selectedSupplierForComm.name || "Selected Supplier";
      const supplierEmail = selectedSupplierForComm.email || `contact@${supplierName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
      const supplierRegion = selectedSupplierForComm.region || selectedSupplierForComm.country || shippingRegion || "Global";
      const product = (productName && productName.trim())
        || (selectedSupplierForComm.product_name && selectedSupplierForComm.product_name.trim())
        || (selectedSupplierForComm.product && selectedSupplierForComm.product.trim())
        || sessionStorage.getItem('procureai_productName')
        || (intelligenceResult as any)?.product_name
        || (intelligenceResult as any)?.procurement_analysis?.product
        || "Industrial Automation Equipment";
      const qty = Number(quantity) || 1;
      const budgetAmount = Number(budget) || 0;
      const unitPrice = selectedSupplierForComm.negotiated_price || selectedSupplierForComm.base_price || 0;
      const leadTimeStr = selectedSupplierForComm.lead_time_days ? `${selectedSupplierForComm.lead_time_days} days` : (leadTime || "30 Days");
      const deliveryLoc = shippingRegion || "India";

      const response = await axios.post(`${API_BASE_URL}/api/procurement/rfq/generate`, {
        supplier_id: supplierId,
        supplier_name: supplierName,
        supplier_email: supplierEmail,
        supplier_region: supplierRegion,
        product: product,
        product_name: product,
        quantity: qty,
        unit_price: unitPrice,
        budget: budgetAmount,
        budget_inr: budgetAmount,
        lead_time: leadTimeStr,
        delivery_location: deliveryLoc,
        custom_requirements: customRequirements || "",
        incoterms: "FOB / EXW",
        payment_terms: "100% Escrow on Delivery"
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      setRfqId(response.data.rfq_id);
      setRfqFilename(response.data.filename);
      toast.success(`RFQ ${response.data.rfq_id} generated successfully!`);
    } catch (err: any) {
      console.error("[ProcureAI] Generate RFQ Error:", err);
      toast.error(formatErrorMessage(err, "Failed to generate RFQ."));
    } finally {
      setIsGeneratingRfq(false);
    }
  };

  const handleViewPdf = async () => {
    if (!rfqId) return;
    setIsViewingPdf(true);
    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      const res = await axios.get(`${API_BASE_URL}/api/procurement/rfq/${rfqId}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        responseType: 'blob'
      });
      const file = new Blob([res.data], { type: 'application/pdf' });
      const fileURL = URL.createObjectURL(file);
      window.open(fileURL, '_blank');
    } catch (err: any) {
      console.error("[ProcureAI] View PDF Error:", err);
      toast.error(formatErrorMessage(err, "Failed to load RFQ PDF."));
    } finally {
      setIsViewingPdf(false);
    }
  };

  const handleSendRfq = async () => {
    if (!rfqId) {
      toast.error("Please generate an RFQ first before sending.");
      return;
    }
    setIsSendingRfq(true);
    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      const response = await axios.post(`${API_BASE_URL}/api/procurement/rfq/${rfqId}/send`, {}, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      const data = response.data;
      if (data.status === 'dry_run') {
        setRfqSentStatus({
          status: 'dry_run',
          message: data.message || "RFQ logged (email dry-run mode, nothing was sent)"
        });
        toast.info("RFQ logged (email dry-run mode, nothing was sent)");
      } else {
        setRfqSentStatus({
          status: 'sent',
          message: data.message || `RFQ ${rfqId} sent successfully to ${data.supplier_email}`
        });
        toast.success("RFQ sent to supplier via email!");
      }
    } catch (err: any) {
      console.error("[ProcureAI] Send RFQ Error:", err);
      const detail = err.response?.data?.detail;
      if (err.response?.status === 422) {
        toast.error(typeof detail === 'string' ? detail : "Supplier email not available. Please verify supplier contact.");
      } else {
        toast.error(formatErrorMessage(err, "Failed to send RFQ."));
      }
    } finally {
      setIsSendingRfq(false);
    }
  };

  const handleSendInquiry = async () => {
    if (!selectedSupplierForComm) return;
    setIsSendingInquiry(true);
    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      const response = await axios.post(`${API_BASE_URL}/api/procurement/send-inquiry`, {
        supplier_name: selectedSupplierForComm.name,
        supplier_email: selectedSupplierForComm.email || "supplier@example.com",
        supplier_region: selectedSupplierForComm.country || selectedSupplierForComm.region || shippingRegion || "Global",
        original_message: `Procurement inquiry for ${quantity || 0} units of ${productName || 'goods'}. Budget: $${budget || 0}. Lead time: ${leadTime || 'Immediate'}. ${customRequirements || ''}`.trim(),
        procurement_context: {
          product: productName || 'goods',
          quantity: quantity || 0,
          budget: budget || 0,
          lead_time: leadTime || 'Immediate',
          requirements: customRequirements || ''
        }
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      
      setInquiryData(response.data);
      setInquirySent(true);

      const emailStatus = response.data?.email_status;
      if (emailStatus?.status === 'dry_run') {
        toast.info("RFQ logged (email dry-run mode)");
      } else {
        toast.success("Procurement inquiry transmitted successfully.");
      }
    } catch (err: any) {
      console.error("[ProcureAI] Send Inquiry Error:", err);
      toast.error(err.response?.data?.detail || "Failed to send procurement inquiry.");
    } finally {
      setIsSendingInquiry(false);
    }
  };

  // Chat Functions
  const handleSendChatMessage = async () => {
    if (!newMessage.trim() || !selectedSupplierForComm) return;

    setIsSendingChat(true);
    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/chat/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          buyer_id: user?.email || 'anonymous',
          supplier_id: selectedSupplierForComm.id.toString(),
          original_message: newMessage,
          source_language: 'en',
          target_language: chatTargetLanguage || (selectedSupplierForComm.region === 'China' ? 'zh' : 'hi')
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();

      // Add buyer message (translated to supplier's language)
      setChatMessages(prev => [...prev, {
        sender: 'buyer',
        original_text: data.buyer_message.original_text,
        translated_text: data.buyer_message.translated_text,
        source_language: data.buyer_message.source_language,
        target_language: data.buyer_message.target_language,
        created_at: new Date().toISOString()
      }]);

      setNewMessage('');
      toast.success('Message sent successfully');
    } catch (error) {
      console.error('Error sending chat message:', error);
      toast.error('Failed to send message');
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error('Speech recognition not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsRecording(true);
        toast.info('🎤 Listening... Speak now');
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        const confidence = event.results[0][0].confidence;
        
        if (transcript && transcript.trim()) {
          setNewMessage(transcript);
          setIsRecording(false);
          toast.success('Speech captured');
        } else {
          setIsRecording(false);
          toast.warning('No speech detected, please try again');
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
        
        const errorMessages: Record<string, string> = {
          'no-speech': 'No speech detected. Please try again.',
          'audio-capture': 'No microphone found. Please check your audio input.',
          'not-allowed': 'Microphone access denied. Please allow microphone permissions.',
          'network': 'Network error. Please check your internet connection.',
          'aborted': 'Speech recognition was aborted.'
        };
        
        const message = errorMessages[event.error] || 'Speech recognition failed. Please try again.';
        toast.error(message);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognition.start();
    } catch (error) {
      console.error('Speech recognition initialization error:', error);
      setIsRecording(false);
      toast.error('Failed to initialize speech recognition. Please try again.');
    }
  };

  const handleDownloadRFQPDF = () => {
    if (!selectedSupplierForComm || !inquiryData) {
      toast.error("No active sourcing session data to export.");
      return;
    }

    const printWindow = window.open('', '_blank', 'width=850,height=950');
    if (!printWindow) {
      toast.error("Popup blocked! Please allow popups to download the RFQ PDF.");
      return;
    }

    const dateStr = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const buyerEmail = user?.email || "buyer@procureai.co";

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Request for Quote (RFQ) - Procure-AI</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
          body {
            font-family: 'Inter', sans-serif;
            color: #0f172a;
            margin: 0;
            padding: 40px;
            line-height: 1.5;
            background-color: #ffffff;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #f1f5f9;
            padding-bottom: 24px;
            margin-bottom: 30px;
          }
          .logo-section h1 {
            font-size: 26px;
            font-weight: 900;
            margin: 0;
            letter-spacing: -0.03em;
            color: #0f172a;
          }
          .logo-section p {
            font-size: 11px;
            color: #64748b;
            margin: 4px 0 0 0;
            text-transform: uppercase;
            font-weight: 700;
            letter-spacing: 0.1em;
          }
          .doc-title {
            text-align: right;
          }
          .doc-title h2 {
            font-size: 20px;
            font-weight: 800;
            margin: 0;
            color: #0f172a;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .doc-title p {
            font-size: 12px;
            color: #64748b;
            margin: 6px 0 0 0;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            margin-bottom: 40px;
          }
          .meta-card {
            background-color: #f8fafc;
            border: 1px solid #f1f5f9;
            border-radius: 12px;
            padding: 20px;
          }
          .meta-card h3 {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: #64748b;
            margin: 0 0 12px 0;
            font-weight: 800;
          }
          .meta-card p {
            margin: 4px 0;
            font-size: 13px;
            font-weight: 600;
          }
          .meta-card .val {
            font-weight: 800;
            color: #0f172a;
          }
          .table-section {
            margin-bottom: 40px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
          }
          th {
            background-color: #f1f5f9;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            font-weight: 800;
            color: #475569;
            padding: 12px 16px;
            border-bottom: 2px solid #e2e8f0;
          }
          td {
            padding: 16px;
            font-size: 13px;
            border-bottom: 1px solid #f1f5f9;
            font-weight: 600;
          }
          .total-row td {
            font-weight: 800;
            font-size: 15px;
            border-top: 2px solid #e2e8f0;
            border-bottom: none;
            background-color: #f8fafc;
          }
          .badge {
            display: inline-block;
            font-size: 9px;
            font-weight: 900;
            padding: 4px 8px;
            border-radius: 6px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .badge-verified {
            background-color: #ecfdf5;
            color: #059669;
          }
          .badge-sec {
            background-color: #f0fdf4;
            color: #16a34a;
          }
          .insight-section {
            background-color: #f5f3ff;
            border: 1px solid #ede9fe;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 40px;
          }
          .insight-section h4 {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: #6d28d9;
            margin: 0 0 8px 0;
            font-weight: 800;
          }
          .insight-section p {
            font-size: 12px;
            color: #5b21b6;
            margin: 0;
            font-weight: 600;
            line-height: 1.6;
          }
          .footer {
            margin-top: 60px;
            border-top: 2px solid #f1f5f9;
            padding-top: 20px;
            text-align: center;
            font-size: 10px;
            color: #94a3b8;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.1em;
          }
          @media print {
            body {
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo-section">
            <h1>PROCURE-AI</h1>
            <p>Autonomous Sourcing Platform</p>
          </div>
          <div class="doc-title">
            <h2>Request For Quote</h2>
            <p>Reference: RFQ-${selectedSupplierForComm.id}</p>
            <p>Date: ${dateStr}</p>
          </div>
        </div>

        <div class="meta-grid">
          <div class="meta-card">
            <h3>Sourcing From (Buyer)</h3>
            <p class="val">${buyerEmail}</p>
            <p>Auth Status: <span class="badge badge-sec">Verified</span></p>
            <p>Payment Mode: <span class="badge badge-verified">ProcureAI Escrow</span></p>
          </div>
          <div class="meta-card">
            <h3>Supplier Details</h3>
            <p class="val">${selectedSupplierForComm.name}</p>
            <p>Region: ${selectedSupplierForComm.country || selectedSupplierForComm.region || 'Global'}</p>
            <p>Email: ${selectedSupplierForComm.email || "partner@global-sourcing.com"}</p>
          </div>
        </div>

        <div class="table-section">
          <table>
            <thead>
              <tr>
                <th>Description / Target Terms</th>
                <th>Required Qty</th>
                <th>Target Budget</th>
                <th>Expected Lead Time</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>${productName}</strong><br/>
                  <span style="font-size: 11px; color: #64748b;">Custom Requirement: ${customRequirements || 'None specified'}</span>
                </td>
                <td>${quantity} Units</td>
                <td>$${budget.toLocaleString()}</td>
                <td>${leadTime}</td>
              </tr>
              <tr class="total-row">
                <td>Estimated Unit Price Sourcing Limit</td>
                <td colspan="3" style="text-align: right;">$${(budget / quantity).toFixed(2)} / Unit</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="insight-section">
          <h4>AI Sourcing Interpretation Seal</h4>
          <p>${inquiryData.supplier_reply_simulation.analysis.extracted_insight}</p>
        </div>

        <div style="font-size: 11px; color: #64748b; line-height: 1.6; margin-bottom: 40px; border-left: 3px solid #cbd5e1; padding-left: 15px;">
          <strong>Procurement Verification Notice:</strong> This request for quotation has been formulated via the ProcureAI Autonomous Procurement Agent. Funds are held in escrow and released only after verified delivery.
        </div>

        <div class="footer">
          Procure-AI Global Sourcing Ecosystem • Confidential Document
        </div>

        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleExecuteDealFromSelection = async (selected: any) => {
    if (isExecuting) return; 

    // Check for duplicate transaction in progress
    const existingTx = sessionStorage.getItem('procureai_pending_tx');
    if (existingTx) {
      const txData = JSON.parse(existingTx);
      const timeDiff = Date.now() - txData.timestamp;
      if (timeDiff < 30000) { // 30 seconds
        return;
      }
    }

    setIsExecuting(true);
    setPaymentPhase(0);
    setError(null);

    // Mark transaction as in progress
    sessionStorage.setItem('procureai_pending_tx', JSON.stringify({
      timestamp: Date.now(),
      supplier_id: selected.id
    }));

    try {
      const response: any = await axios.post(`${API_BASE_URL}/api/procurement/initiate-commitment`, {
        supplier_id: selected.id,
        amount_inr: selected.finalPrice || selected.unit_price || 1000,
        promised_delivery_days: parseInt(selected.deliveryTime) || 3
      });

      const escrow = response.data;
      setTxId(escrow.escrow_id);
      setEscrowRecord(escrow);
      setEscrowStatus(escrow.status ? escrow.status.toLowerCase() : 'created');
      
      // Clear pending transaction marker
      sessionStorage.removeItem('procureai_pending_tx');
      
      setStep('escrow_locked');
      toast.success('Commitment initialized. Proceed to escrow funding.');
    } catch (err: any) {
      setError(`Escrow initiation failed: ${err.response?.data?.detail || err.message}`);
      toast.error('Failed to initiate escrow settlement.');
      sessionStorage.removeItem('procureai_pending_tx');
    } finally {
      setIsExecuting(false);
      setPaymentPhase(0);
    }
  };

  const handleExecuteDeal = async () => {
    if (isExecuting) return; 
    
    if (!result || !result.selectedSupplier) {
      toast.error("Please select a supplier first.");
      return;
    }

    // Check for duplicate transaction in progress
    const existingTx = sessionStorage.getItem('procureai_pending_tx');
    if (existingTx) {
      const txData = JSON.parse(existingTx);
      const timeDiff = Date.now() - txData.timestamp;
      if (timeDiff < 30000) { // 30 seconds
        return;
      }
    }

    setIsExecuting(true);
    setPaymentPhase(0);
    setError(null);

    sessionStorage.setItem('procureai_pending_tx', JSON.stringify({
      timestamp: Date.now(),
      supplier_id: result.selectedSupplier.id
    }));

    try {
      toast.info('Initializing escrow commitment...');
      const response: any = await axios.post(`${API_BASE_URL}/api/procurement/initiate-commitment`, {
        supplier_id: result.selectedSupplier.id,
        amount_inr: result.selectedSupplier.finalPrice || 1000,
        promised_delivery_days: parseInt(result.selectedSupplier.deliveryTime) || 3
      });

      const escrow = response.data;
      setTxId(escrow.escrow_id);
      setEscrowRecord(escrow);
      setEscrowStatus(escrow.status ? escrow.status.toLowerCase() : 'created');
      
      sessionStorage.removeItem('procureai_pending_tx');
      setStep('escrow_locked');
      toast.success('Commitment initialized. Proceed to escrow funding.');
    } catch (err: any) {
      console.error('[ProcureAI] Execute Deal Error:', err);
      setError(`Transaction failed: ${err.response?.data?.detail || err.message}`);
      toast.error('Failed to initiate escrow.');
      sessionStorage.removeItem('procureai_pending_tx');
    } finally {
      setIsExecuting(false);
      setPaymentPhase(0);
    }
  };

  const handleCashfreePayment = async () => {
    if (!txId) {
      toast.error('No escrow record found.');
      return;
    }
    const cleanedPhone = customerPhone.trim();
    if (!/^[6-9]\d{9}$/.test(cleanedPhone)) {
      toast.error('Please enter a valid 10-digit Indian phone number.');
      return;
    }

    setIsPayingCashfree(true);
    setPaymentError(null);

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('procureai_token');
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

      // 1. Create order
      const orderRes = await axios.post(
        `${API_BASE_URL}/api/payments/cashfree/create-order`,
        { escrow_id: txId, customer_phone: cleanedPhone },
        { headers: authHeader }
      );

      const { payment_session_id } = orderRes.data;
      if (!payment_session_id) {
        throw new Error('Payment session ID not returned by Cashfree.');
      }

      // 2. Open Cashfree checkout modal
      const cashfree = await loadCashfree({ mode: 'sandbox' });
      await cashfree.checkout({
        paymentSessionId: payment_session_id,
        redirectTarget: '_modal',
      });

      // 3. Verify payment after checkout modal resolves/closes
      const verifyRes = await axios.post(
        `${API_BASE_URL}/api/payments/cashfree/verify`,
        { escrow_id: txId },
        { headers: authHeader }
      );

      if (verifyRes.data.funded) {
        setEscrowStatus('funded');
        if (verifyRes.data.escrow) setEscrowRecord(verifyRes.data.escrow);
        toast.success('Payment received via Cashfree (sandbox)');
      } else {
        setPaymentError('Payment not completed');
      }
    } catch (err: any) {
      console.error('[Cashfree Checkout Error]', err);
      const msg = err.response?.data?.detail || err.message || 'Payment not completed';
      setPaymentError(msg);
      toast.error(msg);
    } finally {
      setIsPayingCashfree(false);
    }
  };

  const refreshEscrow = async (escrowIdToFetch?: string) => {
    const targetId = escrowIdToFetch || txId;
    if (!targetId) return null;
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('procureai_token');
      const res = await axios.get(`${API_BASE_URL}/api/get-transaction/${targetId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.data) {
        setEscrowRecord(res.data);
        if (res.data.status) {
          setEscrowStatus(res.data.status.toLowerCase());
        }
        if (res.data.status === 'VERIFIED' || res.data.status === 'RELEASED') {
          setIsVerified(true);
        }
        return res.data;
      }
    } catch (err: any) {
      console.error('[ProcureAI] Error refreshing escrow record:', err);
    }
    return null;
  };

  const handleSubmitProof = async () => {
    if (!txId) return;
    if (proofType === 'invoice_file' && !selectedFile) {
      toast.error('Please select an invoice file to upload.');
      return;
    }
    if (selectedFile) {
      const maxSizeBytes = 5 * 1024 * 1024;
      if (selectedFile.size > maxSizeBytes) {
        toast.error('File size exceeds the 5 MB maximum limit.');
        return;
      }
      const ext = selectedFile.name.split('.').pop()?.toLowerCase();
      if (!['jpg', 'jpeg', 'png', 'pdf'].includes(ext || '')) {
        toast.error('Only JPG, PNG, and PDF files are accepted.');
        return;
      }
    }
    
    setIsSubmittingProof(true);
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('procureai_token');
      const formData = new FormData();
      formData.append("escrow_id", txId);
      formData.append("proof_type", proofType);
      
      if (selectedFile) {
        formData.append("file", selectedFile);
      }
      if (proofType !== 'invoice_file' && proofValue) {
        formData.append("value", proofValue);
      }

      const response = await axios.post(`${API_BASE_URL}/api/submit-delivery-proof`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      
      setEscrowStatus('proof_uploaded');
      if (response.data.delivery_proof?.file_path) {
        setProofUrl(response.data.delivery_proof.file_path);
      }
      toast.success('Delivery proof submitted successfully!');
      await refreshEscrow();
    } catch (err: any) {
      console.error('[ProcureAI] Submit Proof Error:', err);
      toast.error(err.response?.data?.detail || err.message || 'Failed to submit delivery proof.');
    } finally {
      setIsSubmittingProof(false);
    }
  };

  const handleAuditProof = async () => {
    if (!txId) return;
    setIsAuditing(true);
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('procureai_token');
      const res = await axios.post(
        `${API_BASE_URL}/api/procurement/audit-proof`,
        { escrow_id: txId },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      setAuditResult(res.data);
      if (res.data.status === 'unavailable') {
        toast.info(res.data.message || 'Automated check unavailable; buyer confirms manually.');
      } else {
        toast.success(res.data.message || 'Automated review check completed.');
      }
      await refreshEscrow();
    } catch (err: any) {
      console.error('[ProcureAI] Audit Proof Error:', err);
      toast.error(err.response?.data?.detail || err.message || 'Failed to audit delivery proof.');
    } finally {
      setIsAuditing(false);
    }
  };

  const handleVerifyProof = async () => {
    if (!txId) return;
    setIsVerifying(true);
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('procureai_token');
      const response = await axios.post(
        `${API_BASE_URL}/api/procurement/verify-delivery`,
        { escrow_id: txId },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      
      setEscrowStatus('verified');
      setIsVerified(true);
      if (response.data.escrow) {
        setEscrowRecord(response.data.escrow);
      }
      toast.success('Delivery proof verified by buyer.');
      await refreshEscrow();
    } catch (err: any) {
      console.error('[ProcureAI] Verify Proof Error:', err);
      toast.error(err.response?.data?.detail || err.message || 'Verification failed.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleConfirmDelivery = async () => {
    if (!txId || !result) return;
    setIsConfirming(true);
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('procureai_token');
      const response = await axios.post(
        `${API_BASE_URL}/api/procurement/release-settlement`,
        { transaction_id: txId },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );

      if (response.data.escrow) {
        setEscrowRecord(response.data.escrow);
      }

      addTransaction({
        id: Date.now().toString(),
        supplier: result?.selectedSupplier?.name || "Verified Supplier",
        amount: result?.selectedSupplier?.finalPrice || 0,
        status: 'Completed',
        txId: txId,
        date: new Date().toISOString().split('T')[0]
      });

      setEscrowStatus('released');
      setStep('payment');
      toast.success('Settlement initiated (simulated payout)');
      await refreshEscrow();
    } catch (err: any) {
      console.error('[ProcureAI] Confirm Delivery Error:', err);
      toast.error(err.response?.data?.detail || err.message || 'Failed to release funds.');
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="space-y-6 min-h-[calc(100vh-2rem)] bg-slate-50 p-6 -mx-4 md:-mx-8 lg:-mx-12 -mt-4 text-slate-900">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-1 max-w-7xl mx-auto">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-slate-900">AI Procurement Intelligence</h1>
          <p className="text-slate-500 mt-1.5 font-medium text-xs">Enterprise copilot for global sourcing.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-amber-50 text-amber-600 border-none text-[8px] font-black uppercase tracking-widest">Trade Assurance</Badge>
          <Badge className="bg-primary/10 text-primary border-none text-[8px] font-black uppercase tracking-widest">Escrow Protected</Badge>
        </div>
      </div>

      {/* TIMELINE PROGRESSION BAR */}
      <div className="max-w-7xl mx-auto bg-white border border-slate-200 rounded-[1.5rem] p-5 shadow-sm">
        <div className="flex items-center justify-between">
          {[
            { label: 'Discovery', desc: 'AI Global Sourcing', stepValue: 'form' },
            { label: 'Negotiation', desc: 'Multi-Lingual Engine', stepValue: 'intelligence_dashboard' },
            { label: 'Approval', desc: 'Shortlist Partnership', stepValue: 'communication' },
            { label: 'Commitment', desc: 'Escrow Lock', stepValue: 'escrow_locked' },
            { label: 'Verification', desc: 'Delivery Proof', stepValue: 'escrow_locked' },
            { label: 'Settlement', desc: 'Fund Release', stepValue: 'payment' }
          ].map((tStep, idx) => {
            const currentIdx =
              (step === 'form' || step === 'intelligence_loading') ? 0 :
              (step === 'intelligence_dashboard') ? 1 :
              (step === 'communication') ? 2 :
              (step === 'escrow_locked' && !isVerified) ? 3 :
              (step === 'escrow_locked' && isVerified) ? 4 :
              (step === 'payment') ? 5 : 0;

            const isCompleted = idx < currentIdx;
            const isActive = idx === currentIdx;

            const handleStepClick = () => {
              // Allow navigation to any completed step or current step
              if (isCompleted || isActive) {
                // Restore necessary state for each step
                if (tStep.stepValue === 'form') {
                  setStep('form');
                } else if (tStep.stepValue === 'intelligence_dashboard' && intelligenceResult) {
                  setStep('intelligence_dashboard');
                } else if (tStep.stepValue === 'communication' && selectedSupplierForComm) {
                  setStep('communication');
                } else if (tStep.stepValue === 'escrow_locked' && txId) {
                  setStep('escrow_locked');
                } else if (tStep.stepValue === 'payment' && txId) {
                  setStep('payment');
                }
              }
            };

            return (
              <React.Fragment key={idx}>
                <div
                  className={cn(
                    "flex flex-col items-center flex-1 relative cursor-pointer",
                    (isCompleted || isActive) ? "hover:scale-105 transition-transform" : "cursor-not-allowed opacity-50"
                  )}
                  onClick={handleStepClick}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all duration-500",
                    isCompleted ? "bg-emerald-500 text-white shadow-lg shadow-emerald-100" :
                    isActive ? "bg-primary text-white ring-4 ring-primary/20 scale-110 shadow-lg shadow-primary/10" :
                    "bg-slate-100 text-slate-400 border border-slate-200"
                  )}>
                    {isCompleted ? <Check className="w-4 h-4" /> : idx + 1}
                  </div>
                  <span className={cn(
                    "text-[10px] font-black uppercase tracking-wider mt-3",
                    isActive ? "text-primary" : "text-slate-800"
                  )}>{tStep.label}</span>
                  <span className="text-[8px] text-slate-400 font-bold text-center mt-1 hidden md:block max-w-[120px]">{tStep.desc}</span>
                </div>
                {idx < 5 && (
                  <div className="flex-1 h-0.5 max-w-[60px] self-start mt-4 bg-slate-100 relative overflow-hidden">
                    <div className={cn(
                      "absolute inset-y-0 left-0 transition-all duration-700 bg-gradient-to-r from-violet-600 to-indigo-500",
                      isCompleted ? "w-full" : "w-0"
                    )} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === 'form' && (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-7xl mx-auto space-y-12"
          >
            {/* SECTION 1: Procurement Input Area */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <form onSubmit={handleFindSupplier} className="flex flex-col lg:flex-row gap-4 items-center">
                <div className="flex-1 w-full flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 h-12">
                  <Search className="w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    className="bg-transparent border-none outline-none text-slate-900 w-full text-sm font-medium placeholder-slate-400"
                    placeholder="Search product (e.g. 50x Industrial Motors)"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                  />
                </div>
                
                <div className="w-full lg:w-32 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 h-12">
                  <Layers className="w-4 h-4 text-slate-400" />
                  <input
                    type="number"
                    min="1"
                    required
                    className="bg-transparent border-none outline-none text-slate-900 w-full text-sm font-medium placeholder-slate-400"
                    placeholder="Qty"
                    value={quantity || ''}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                  />
                </div>

                <div className="w-full lg:w-40 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 h-12">
                  <DollarSign className="w-4 h-4 text-slate-400" />
                  <input
                    type="number"
                    min="1"
                    required
                    className="bg-transparent border-none outline-none text-slate-900 w-full text-sm font-medium placeholder-slate-400"
                    placeholder="Budget"
                    value={budget || ''}
                    onChange={(e) => setBudget(parseInt(e.target.value) || 0)}
                  />
                </div>

                <div className="w-full lg:w-48 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 h-12">
                  <Truck className="w-4 h-4 text-slate-400" />
                  <select
                    className="bg-transparent border-none outline-none text-slate-900 w-full text-sm font-medium appearance-none"
                    value={shippingRegion}
                    onChange={(e) => setShippingRegion(e.target.value)}
                  >
                    <option value="Global">Global</option>
                    <option value="China">China</option>
                    <option value="India">India</option>
                    <option value="Europe">Europe</option>
                    <option value="USA">USA</option>
                  </select>
                </div>

                <Button
                  type="submit"
                  disabled={isSearching}
                  className="w-full lg:w-auto h-12 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold px-8 shadow-sm transition-colors"
                >
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                  Procure AI
                </Button>
              </form>
              
              <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 h-12">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    className="bg-transparent border-none outline-none text-slate-900 w-full text-sm font-medium placeholder-slate-400"
                    placeholder="Lead Time (e.g. 30 Days)"
                    value={leadTime}
                    onChange={(e) => setLeadTime(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 h-12">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    className="bg-transparent border-none outline-none text-slate-900 w-full text-sm font-medium placeholder-slate-400"
                    placeholder="Custom Requirements (e.g. 180 GSM cotton, branding)"
                    value={customRequirements}
                    onChange={(e) => setCustomRequirements(e.target.value)}
                  />
                </div>
              </div>
            </div>
            {error && (
              <div className="mt-4 p-4 bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-xl text-[#EF4444] text-sm font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> {error}
              </div>
            )}
          </motion.div>
        )}

        {step === 'intelligence_loading' && (
          <motion.div
            key="intelligence_loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-12"
          >
            <IntelligenceLoading />
          </motion.div>
        )}

        {step === 'intelligence_dashboard' && intelligenceResult && (
          <motion.div
            key="intelligence_dashboard"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-7xl mx-auto space-y-8"
          >
            <SupplierIntelligenceDashboard 
              data={{
                ...intelligenceResult!,
                recommended_suppliers: intelligenceResult!.recommended_suppliers || 
                  (intelligenceResult!.recommended_supplier ? [intelligenceResult!.recommended_supplier] : [])
              }}
              onSelectSupplier={handleSelectIntelligenceSupplier}
              requestDetails={{
                product_name: productName,
                quantity,
                budget,
                shipping_region: shippingRegion,
                lead_time: leadTime,
                custom_requirements: customRequirements
              }}
            />
          </motion.div>
        )}


    {step === 'communication' && selectedSupplierForComm && (
      <motion.div
        key="communication"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="max-w-7xl mx-auto space-y-8"
      >
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
              <Globe className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-display font-bold text-slate-900">Cross-Border Procurement Communication</h2>
              <p className="text-slate-500 font-medium text-xs flex items-center gap-2 mt-1">
                <span>Target Partner: <strong className="text-slate-900">{selectedSupplierForComm.name}</strong></span>
                <span>•</span>
                <span>Region: <strong className="text-slate-800">{selectedSupplierForComm.region || selectedSupplierForComm.country || "Global"}</strong></span>
                {selectedSupplierForComm.trust_score && (
                  <>
                    <span>•</span>
                    <Badge className="bg-emerald-50 text-emerald-700 border-none text-[9px] font-black uppercase">
                      Trust {selectedSupplierForComm.trust_score}%
                    </Badge>
                  </>
                )}
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setStep('intelligence_dashboard')} className="rounded-xl border-slate-200 self-start md:self-auto cursor-pointer">
            Back to Dashboard
          </Button>
        </div>

        {/* 3-COLUMN ORIGINAL LAYOUT: Left (Inquiry & RFQ PDF), Center (Multilingual Chat), Right (Supplier Intel & Commit) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT CARD (col-span-4): Buyer Procurement Inquiry & RFQ PDF Generator */}
          <div className="lg:col-span-4 space-y-6">
            <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden bg-white">
              <CardHeader className="bg-slate-50/70 border-b border-slate-100 flex flex-row items-center justify-between py-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <CardTitle className="text-sm font-bold text-slate-900">
                    Buyer Procurement Inquiry
                  </CardTitle>
                </div>
                {rfqId ? (
                  <Badge className="bg-emerald-100 text-emerald-800 border-none text-[9px] font-bold tracking-wider">
                    RFQ Generated
                  </Badge>
                ) : (
                  <Badge className="bg-slate-100 text-slate-600 border-none text-[9px] font-bold tracking-wider">
                    Draft Inquiry
                  </Badge>
                )}
              </CardHeader>

              <CardContent className="p-5 space-y-5">
                {/* Target Supplier Specs */}
                <div className="space-y-3 p-3.5 bg-slate-50 border border-slate-100 rounded-xl text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Recipient:</span>
                    <span className="font-bold text-slate-900 truncate max-w-[180px]">{selectedSupplierForComm.name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Contact:</span>
                    <span className="font-mono text-slate-700 truncate max-w-[180px] text-[11px]">
                      {selectedSupplierForComm.email || "No email on record"}
                    </span>
                  </div>

                  {/* Item / Product Name */}
                  <div className="space-y-1 pt-1.5 border-t border-slate-200/60">
                    <span className="text-slate-600 font-semibold block text-[11px]">Item / Product Name:</span>
                    <Input
                      type="text"
                      value={productName || selectedSupplierForComm.product_name || selectedSupplierForComm.product || ''}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder="e.g. Industrial Automation Sensors..."
                      className="h-8 text-xs font-semibold bg-white border-slate-200 rounded-lg px-2.5"
                    />
                  </div>

                  {/* Quantity & Budget */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-slate-600 font-semibold block text-[11px] mb-0.5">Quantity:</span>
                      <Input
                        type="number"
                        min="1"
                        value={quantity || 1}
                        onChange={(e) => setQuantity(Number(e.target.value))}
                        className="h-8 text-xs font-semibold bg-white border-slate-200 rounded-lg px-2"
                      />
                    </div>
                    <div>
                      <span className="text-slate-600 font-semibold block text-[11px] mb-0.5">Target Budget (₹):</span>
                      <Input
                        type="number"
                        min="0"
                        value={budget || 0}
                        onChange={(e) => setBudget(Number(e.target.value))}
                        className="h-8 text-xs font-semibold bg-white border-slate-200 rounded-lg px-2"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
                    <span className="text-slate-500 font-medium">Lead Time:</span>
                    <span className="text-slate-700 font-medium">{selectedSupplierForComm.lead_time_days ? `${selectedSupplierForComm.lead_time_days} days` : (leadTime || '30 Days')}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Delivery:</span>
                    <span className="text-slate-700 font-medium truncate max-w-[180px]">{shippingRegion || selectedSupplierForComm.region || 'Global'}</span>
                  </div>
                  {customRequirements && (
                    <div className="pt-1.5 border-t border-slate-200 text-[11px] text-slate-600">
                      <span className="font-medium text-slate-500 block mb-0.5">Custom Notes:</span>
                      <p className="italic line-clamp-2">{customRequirements}</p>
                    </div>
                  )}
                </div>

                {/* RFQ Generation Action */}
                <div className="space-y-3">
                  <Button
                    onClick={handleGenerateRfq}
                    disabled={isGeneratingRfq}
                    className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isGeneratingRfq ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating RFQ PDF...
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4" />
                        {rfqId ? "Regenerate RFQ (PDF)" : "Generate RFQ"}
                      </>
                    )}
                  </Button>

                  {/* Generated RFQ Details & Preview */}
                  {rfqId && (
                    <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                          <span className="text-xs font-bold text-emerald-950 font-mono">
                            {rfqId}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleViewPdf}
                          disabled={isViewingPdf}
                          className="h-8 px-2.5 text-xs bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-lg flex items-center gap-1 font-semibold cursor-pointer"
                        >
                          {isViewingPdf ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                          <span>View PDF</span>
                        </Button>
                      </div>
                      <p className="text-[11px] text-emerald-800 truncate">
                        File: {rfqFilename || `${rfqId}.pdf`}
                      </p>
                    </div>
                  )}

                  {/* Send RFQ Button */}
                  <Button
                    onClick={handleSendRfq}
                    disabled={!rfqId || isSendingRfq}
                    className="w-full h-11 bg-slate-900 hover:bg-black text-white font-bold rounded-xl shadow flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSendingRfq ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Transmitting RFQ...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 text-emerald-400" />
                        <span>Send RFQ to Supplier</span>
                      </>
                    )}
                  </Button>
                  {!rfqId && (
                    <p className="text-[10px] text-slate-400 text-center">
                      Generate the official RFQ PDF above before transmitting to the supplier.
                    </p>
                  )}
                </div>

                {/* RFQ Transmission Feedback / Notice */}
                {rfqSentStatus && (
                  <div className={cn(
                    "p-3.5 rounded-xl border text-xs space-y-1.5",
                    rfqSentStatus.status === 'dry_run'
                      ? "bg-amber-50/80 border-amber-200 text-amber-900"
                      : "bg-emerald-50/80 border-emerald-200 text-emerald-900"
                  )}>
                    <div className="flex items-center gap-2 font-bold">
                      <CheckCircle2 className={cn("w-4 h-4", rfqSentStatus.status === 'dry_run' ? "text-amber-600" : "text-emerald-600")} />
                      <span>{rfqSentStatus.status === 'dry_run' ? "RFQ Logged (Dry-Run Mode)" : "RFQ Dispatched"}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed opacity-90">
                      {rfqSentStatus.message}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* CENTER CARD (col-span-5): Multilingual Procurement Chat */}
          <div className="lg:col-span-5 space-y-6">
            <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden min-h-[540px] flex flex-col bg-white">
              <CardHeader className="bg-slate-50/70 border-b border-slate-100 flex flex-row items-center justify-between py-3.5 px-4">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900">
                  <Languages className="w-4 h-4 text-primary" /> Multilingual Chat
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 font-bold uppercase hidden sm:inline">Translate:</span>
                  <select
                    value={chatTargetLanguage}
                    onChange={(e) => setChatTargetLanguage(e.target.value)}
                    className="bg-white border border-slate-200 text-xs font-semibold rounded-lg px-2.5 py-1 outline-none text-slate-700 cursor-pointer shadow-sm"
                  >
                    {availableLanguages.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.flag} {lang.label}
                      </option>
                    ))}
                  </select>
                </div>
              </CardHeader>
              <CardContent className="p-4 flex-1 flex flex-col justify-between">
                {/* Chat Messages Area */}
                <div className="flex-1 overflow-y-auto space-y-3 mb-4 max-h-[380px] pr-2">
                  {chatMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-3 py-12">
                      <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center">
                        <MessageSquare className="w-6 h-6 text-slate-300" />
                      </div>
                      <p className="text-xs text-slate-600 font-medium">Direct live line to {selectedSupplierForComm.name}</p>
                      <p className="text-[10px] text-slate-400 max-w-[240px]">Messages are instantly translated back and forth into {availableLanguages.find(l => l.code === chatTargetLanguage)?.label || 'Hindi'}.</p>
                    </div>
                  ) : (
                    chatMessages.map((msg, idx) => (
                      <div key={idx} className={`flex ${msg.sender === 'buyer' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] ${msg.sender === 'buyer' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-900'} rounded-2xl px-4 py-3 shadow-sm`}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <Badge className={`text-[8px] font-black uppercase tracking-wider ${msg.sender === 'buyer' ? 'bg-white/20 text-white border-none' : 'bg-slate-200 text-slate-600 border-none'}`}>
                              {msg.source_language?.toUpperCase() || 'EN'} → {msg.target_language?.toUpperCase() || chatTargetLanguage.toUpperCase()}
                            </Badge>
                          </div>
                          <p className="text-xs font-medium leading-relaxed mb-1.5">
                            {msg.original_text}
                          </p>
                          {msg.translated_text && msg.translated_text !== msg.original_text && (
                            <div className={`pt-1.5 border-t ${msg.sender === 'buyer' ? 'border-white/20' : 'border-slate-200'}`}>
                              <p className={`text-[10px] font-normal leading-relaxed ${msg.sender === 'buyer' ? 'text-primary-foreground/90' : 'text-slate-600'}`}>
                                {msg.translated_text}
                              </p>
                            </div>
                          )}
                          <p className={`text-[8px] mt-1.5 ${msg.sender === 'buyer' ? 'text-white/70' : 'text-slate-400'}`}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Chat Input Area */}
                <div className="border-t border-slate-100 pt-3 space-y-2">
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Input
                        type="text"
                        placeholder="Type message to supplier..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendChatMessage()}
                        className="pr-12 h-11 rounded-xl border-slate-200 text-xs"
                        disabled={isSendingChat}
                      />
                      <button
                        onClick={handleVoiceInput}
                        disabled={isRecording}
                        className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors cursor-pointer ${isRecording ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        title="Voice Input"
                      >
                        {isRecording ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mic className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <Button
                      onClick={handleSendChatMessage}
                      disabled={isSendingChat || !newMessage.trim()}
                      className="h-11 px-4 bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold cursor-pointer"
                    >
                      {isSendingChat ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-[9px] text-slate-400 text-center">
                    Auto-translated to partner's native language • Voice input available
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT CARD (col-span-3): Supplier Intelligence + Commit to Procurement */}
          <div className="lg:col-span-3 space-y-6">
            <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden bg-white">
              <CardHeader className="bg-slate-50/70 border-b border-slate-100 py-3.5 px-4">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900">
                  <Activity className="w-4 h-4 text-primary" /> Supplier Intelligence
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {/* Signals */}
                <div className="space-y-2.5">
                  {[
                    {
                      signal: "MOQ Flexibility",
                      status: inquiryData?.supplier_reply_simulation?.analysis?.moq_flexibility || (result?.selectedSupplier?.reliability && result.selectedSupplier.reliability > 85 ? "HIGH" : "MODERATE"),
                      color: "text-emerald-600"
                    },
                    {
                      signal: "Lead Time Risk",
                      status: inquiryData?.supplier_reply_simulation?.analysis?.lead_time_risk || "LOW",
                      color: "text-emerald-600"
                    },
                    {
                      signal: "Pricing Openness",
                      status: inquiryData?.supplier_reply_simulation?.analysis?.pricing_flexibility || "FAVORABLE",
                      color: "text-primary"
                    },
                    {
                      signal: "Partnership Intent",
                      status: inquiryData?.supplier_reply_simulation?.analysis?.partnership_intent || "COLLABORATIVE",
                      color: "text-cyan-600"
                    }
                  ].map((card, i) => (
                    <div key={i} className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between text-xs">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{card.signal}</span>
                      <span className={cn("text-[11px] font-black uppercase tracking-wider", card.color)}>{card.status}</span>
                    </div>
                  ))}
                </div>

                {/* AI Insight */}
                <div className="p-3 bg-primary/5 border border-primary/10 rounded-xl space-y-1.5">
                  <p className="text-[9px] font-black text-primary uppercase tracking-widest flex items-center gap-1">
                    <Info className="w-3 h-3" /> AI Verification Note
                  </p>
                  <p className="text-[11px] text-slate-700 leading-relaxed font-medium">
                    {inquiryData?.supplier_reply_simulation?.analysis?.extracted_insight ||
                     result?.selectedSupplier?.reasoning ||
                     "Supplier demonstrates high fulfillment reliability with verified factory compliance standards."}
                  </p>
                </div>

                {/* Deal Summary */}
                <div className="p-3 bg-slate-900 text-white rounded-xl space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Unit Price:</span>
                    <span className="font-bold">${selectedSupplierForComm.negotiated_price || selectedSupplierForComm.base_price || 0}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Total Quantity:</span>
                    <span className="font-bold">{quantity || 1} units</span>
                  </div>
                  <div className="flex justify-between items-center text-xs pt-1.5 border-t border-slate-800">
                    <span className="text-slate-300 font-semibold">Total Escrow Value:</span>
                    <span className="text-emerald-400 font-bold">
                      ${(((selectedSupplierForComm.negotiated_price || selectedSupplierForComm.base_price || 0) * (Number(quantity) || 1))).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Commit to Procurement Button */}
                <Button
                  onClick={() => handleExecuteDealFromSelection(result!.selectedSupplier)}
                  disabled={isExecuting}
                  className="w-full h-12 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:via-teal-500 hover:to-cyan-500 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md shadow-emerald-500/20 hover:shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  {isExecuting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Shield className="w-4 h-4" />
                      Commit to Procurement
                    </>
                  )}
                </Button>
                <p className="text-[9px] text-slate-400 text-center">
                  Funds held safely in escrow until delivery is verified.
                </p>
              </CardContent>
            </Card>
          </div>

        </div>
      </motion.div>
    )}


        {step === 'escrow_locked' && txId && (
          <motion.div
            key="escrow_locked"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-3xl mx-auto"
          >
            <Card className="bg-white border-slate-100 overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-[2rem] p-0">
              <div className="bg-[#0A2540] pt-10 pb-8 px-8 text-center text-white relative">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-30 mix-blend-overlay" />
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 12 }}
                  className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6 relative"
                >
                  <div className="absolute inset-0 rounded-full border border-amber-500/30 animate-[spin_4s_linear_infinite]" />
                  <div className="w-14 h-14 bg-amber-500 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.5)]">
                    <Lock className="w-7 h-7 text-white relative z-10" />
                  </div>
                </motion.div>
                <h2 className="text-2xl font-display font-medium mb-2 tracking-tight">Secure Procurement Commitment</h2>
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 mb-4 font-bold tracking-widest px-4 py-1 uppercase text-[10px]">Proof Required</Badge>
                <p className="text-slate-300 max-w-sm mx-auto font-medium text-xs leading-relaxed">Escrow-protected procurement settlement lifecycle</p>
              </div>

              <CardContent className="p-8 space-y-8">
                {/* Enterprise Procurement Summary Panel */}
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6">
                  <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <Database className="w-4 h-4 text-primary" /> Enterprise Procurement Summary
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Selected Supplier</p>
                      <p className="text-sm font-bold text-slate-900 truncate" title={result?.selectedSupplier?.name}>{result?.selectedSupplier?.name}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Negotiated Price</p>
                      <p className="text-sm font-bold text-emerald-600">${result?.selectedSupplier?.finalPrice}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Expected Lead Time</p>
                      <p className="text-sm font-bold text-slate-900">{result?.selectedSupplier?.deliveryTime}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Procurement Risk</p>
                      <p className="text-sm font-bold text-emerald-600">LOW</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">AI Confidence</p>
                      <p className="text-sm font-bold text-primary">{result?.selectedSupplier?.reliability}%</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Policy Compliance</p>
                      <p className="text-sm font-bold text-emerald-600">VERIFIED</p>
                    </div>
                  </div>
                </div>

                {/* Cashfree Sandbox Payment Card (When escrow status is CREATED) */}
                {escrowStatus === 'created' ? (
                  <div className="space-y-6">
                    <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl space-y-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Escrow Funding Amount</p>
                          <p className="text-3xl font-display font-bold text-slate-900">
                            ₹{(escrowRecord?.amount_inr || result?.selectedSupplier?.finalPrice || 1000).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        <span className="self-start sm:self-center px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          Sandbox mode: no real money moves
                        </span>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                          Customer Phone Number (India)
                        </label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">
                            +91
                          </span>
                          <input
                            type="tel"
                            maxLength={10}
                            value={customerPhone}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '');
                              if (val.length <= 10) setCustomerPhone(val);
                            }}
                            placeholder="Enter 10-digit number (e.g. 9876543210)"
                            className="w-full pl-14 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-900 font-semibold text-sm bg-white"
                          />
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Enter your 10-digit mobile number for Cashfree Sandbox simulated authorization.
                        </p>
                      </div>

                      {paymentError && (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-2">
                          <div className="flex items-center gap-2 text-sm font-semibold text-red-600">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{paymentError}</span>
                          </div>
                          <button
                            onClick={() => {
                              setPaymentError(null);
                              handleCashfreePayment();
                            }}
                            className="text-xs font-bold text-red-700 underline hover:text-red-800 cursor-pointer block"
                          >
                            Try again
                          </button>
                        </div>
                      )}

                      <div className="pt-2">
                        <button
                          onClick={handleCashfreePayment}
                          disabled={isPayingCashfree || customerPhone.length !== 10}
                          className={cn(
                            "w-full h-14 text-sm font-black uppercase tracking-wider rounded-xl shadow-lg transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer",
                            customerPhone.length === 10 && !isPayingCashfree
                              ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-500/20 active:scale-[0.99]"
                              : "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                          )}
                        >
                          {isPayingCashfree ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin mr-1" />
                              Processing Sandbox Payment...
                            </>
                          ) : (
                            <>
                              <Lock className="w-4 h-4 mr-1" />
                              Pay ₹{(escrowRecord?.amount_inr || result?.selectedSupplier?.finalPrice || 1000).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Cashfree sandbox)
                            </>
                          )}
                        </button>
                      </div>

                      <div className="text-center pt-2">
                        <p className="text-[11px] text-slate-400 font-medium">
                          Payment received via Cashfree (sandbox). Escrow protection activates immediately upon verification.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Escrow Status Stepper (5 STAGES) */}
                    <div className="space-y-6">
                      <div className="flex items-center justify-between px-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Escrow Lifecycle</p>
                        <Badge variant="outline" className={cn(
                          "text-[9px] font-bold uppercase tracking-widest px-3 py-1",
                          escrowStatus === 'released' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                          escrowStatus === 'verified' ? "bg-teal-50 text-teal-600 border-teal-100" :
                          (escrowStatus === 'proof_uploaded' || escrowStatus === 'proof_submitted') ? "bg-blue-50 text-blue-600 border-blue-100" :
                          "bg-amber-50 text-amber-600 border-amber-100"
                        )}>
                          {escrowStatus === 'released' ? "Settlement Initiated" :
                           escrowStatus === 'verified' ? "Verified" :
                           (escrowStatus === 'proof_uploaded' || escrowStatus === 'proof_submitted') ? "Proof Uploaded" :
                           "Payment Received"}
                        </Badge>
                      </div>

                      <div className="relative">
                        {/* Progress line */}
                        <div className="absolute top-5 left-4 right-4 h-0.5 bg-slate-100" />
                        <motion.div 
                          className="absolute top-5 left-4 h-0.5 bg-primary z-10"
                          initial={{ width: '0%' }}
                          animate={{ 
                            width: escrowStatus === 'released' ? '100%' : 
                                   escrowStatus === 'verified' ? '75%' : 
                                   (escrowStatus === 'proof_uploaded' || escrowStatus === 'proof_submitted') ? '50%' : 
                                   '25%' 
                          }}
                        />
                        
                        <div className="grid grid-cols-5 gap-2 relative z-10">
                          {[
                            { id: 'approved', label: 'Supplier Approved', icon: ShieldCheck, status: 'completed' },
                            { id: 'funded', label: 'Funds Secured', icon: Lock, status: 'completed' },
                            { id: 'proof_uploaded', label: 'Proof Uploaded', icon: FileUp, status: (escrowStatus === 'proof_uploaded' || escrowStatus === 'proof_submitted') ? 'current' : (['verified', 'released'].includes(escrowStatus) ? 'completed' : 'upcoming') },
                            { id: 'verified', label: 'Delivery Verified', icon: CheckCircle2, status: escrowStatus === 'verified' ? 'current' : (escrowStatus === 'released' ? 'completed' : 'upcoming') },
                            { id: 'released', label: 'Settlement initiated (simulated payout)', icon: Zap, status: escrowStatus === 'released' ? 'completed' : 'upcoming' }
                          ].map((s, i) => (
                            <div key={s.id} className="flex flex-col items-center gap-3">
                              <div className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 shadow-sm",
                                s.status === 'completed' ? "bg-emerald-500 border-emerald-500 text-white shadow-emerald-200" :
                                s.status === 'current' ? "bg-white border-primary text-primary shadow-primary/10 animate-pulse" :
                                "bg-white border-slate-100 text-slate-300"
                              )}>
                                <s.icon className="w-5 h-5" />
                              </div>
                              <span className={cn(
                                "text-[8px] font-black uppercase tracking-widest text-center",
                                s.status === 'upcoming' ? "text-slate-300" : "text-slate-900"
                              )}>{s.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-5 bg-slate-50 border border-slate-100 rounded-2xl text-center">
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Commitment Status</span>
                        <span className="text-xs font-bold text-emerald-600">ACTIVE</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Settlement Layer</span>
                        <span className="text-xs font-bold text-slate-900">ProcureAI Escrow</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Escrow Protection</span>
                        <span className="text-xs font-bold text-slate-900">ENABLED</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Delivery Verification</span>
                        <span className="text-xs font-bold text-slate-900">REQUIRED</span>
                      </div>
                      <div className="flex flex-col gap-1 border-l-0 md:border-l border-slate-200">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Supplier Approval</span>
                        <span className="text-xs font-bold text-emerald-600">VERIFIED</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Proof Submission Panel */}
                      <div className="space-y-4 bg-slate-50/50 rounded-2xl border border-slate-100 p-6">
                        <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <FileUp className="w-4 h-4 text-primary" /> Submit Proof
                        </h3>
                        <p className="text-[10px] font-bold bg-amber-50 text-amber-700 px-3 py-2 rounded-lg mb-4">
                          Settlement release requires verified fulfillment.
                        </p>
                        
                        <div className="space-y-3">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Proof Method</label>
                          <select 
                            value={proofType}
                            onChange={(e: any) => setProofType(e.target.value)}
                            className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all shadow-sm"
                          >
                            <option value="invoice_file">Invoice Upload (Image/PDF)</option>
                            <option value="timestamp">Delivery Timestamp</option>
                            <option value="tracking_id">Carrier Tracking ID</option>
                          </select>
                        </div>

                        {proofType === 'invoice_file' ? (
                          <div className="space-y-3">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Upload Document</label>
                            <div className="relative">
                              <input
                                type="file"
                                id="invoice-upload"
                                className="hidden"
                                accept="image/jpeg,image/png,application/pdf"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) setSelectedFile(file);
                                }}
                              />
                              <label
                                htmlFor="invoice-upload"
                                className={cn(
                                  "flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-2xl cursor-pointer transition-all gap-2",
                                  selectedFile ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200 bg-white hover:border-primary/30 hover:bg-slate-50"
                                )}
                              >
                                {selectedFile ? (
                                  <>
                                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                                    <div className="text-center px-4">
                                      <p className="text-[10px] font-black text-emerald-600 uppercase truncate max-w-[200px]">{selectedFile.name}</p>
                                      <p className="text-[8px] text-slate-400 mt-0.5">{(selectedFile.size / 1024).toFixed(1)} KB • Click to change</p>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <Upload className="w-8 h-8 text-slate-300" />
                                    <div className="text-center px-4">
                                      <p className="text-[10px] font-black text-slate-400 uppercase">Drop invoice here</p>
                                      <p className="text-[8px] text-slate-400 mt-0.5">PNG, JPG, PDF up to 5MB</p>
                                    </div>
                                  </>
                                )}
                              </label>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                              {proofType === 'timestamp' ? 'Submission Timestamp' : 'Tracking Number'}
                            </label>
                            <Input 
                              placeholder={proofType === 'timestamp' ? "e.g. 2024-05-01 14:00" : "e.g. TRK-8829-X"}
                              value={proofValue}
                              onChange={(e) => setProofValue(e.target.value)}
                              className="h-11 bg-white border-slate-200 rounded-xl text-xs font-bold"
                            />
                          </div>
                        )}

                        <button
                          onClick={handleSubmitProof}
                          disabled={isSubmittingProof || escrowStatus !== 'funded'}
                          className="w-full h-12 text-xs font-black uppercase tracking-widest bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 text-white rounded-xl shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer"
                        >
                          {isSubmittingProof ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileUp className="w-4 h-4 mr-1 text-slate-300" />}
                          {['proof_uploaded', 'proof_submitted', 'verified', 'released'].includes(escrowStatus) ? 'Replace Proof Document' : 'Submit for Review'}
                        </button>
                        
                        <p className="text-[8px] text-slate-400 font-bold uppercase text-center mt-2 leading-relaxed">
                          Accepted formats: JPG, PNG, PDF up to 5 MB. Stored securely in database.
                        </p>
                      </div>

                      {/* Verification Panel */}
                      <div className="space-y-4 bg-primary/5 rounded-2xl border border-primary/10 p-6 flex flex-col justify-between">
                        <div className="space-y-4">
                          <h3 className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4" /> Audit & Validate
                          </h3>
                          
                          <div className="flex items-start gap-3 p-3 bg-white/70 rounded-xl border border-primary/10">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <Eye className="w-4 h-4 text-primary" />
                            </div>
                            <div>
                              <p className="text-[10px] font-black text-slate-900 uppercase">Review Process</p>
                              <p className="text-[9px] text-slate-600 font-medium leading-relaxed mt-0.5">
                                The buyer reviews the uploaded proof. An automated check highlights mismatches with the order.
                              </p>
                            </div>
                          </div>

                          {/* Proof Preview If Uploaded */}
                          {Boolean(proofUrl || ['proof_uploaded', 'proof_submitted', 'verified', 'released'].includes(escrowStatus)) && (
                            <div className="space-y-2">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Uploaded Proof</p>
                              {proofUrl ? (
                                <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
                                  {proofUrl.endsWith('.pdf') ? (
                                    <div className="w-10 h-10 rounded-lg bg-red-50 text-red-500 border border-red-100 flex items-center justify-center shrink-0">
                                      <FileText className="w-5 h-5" />
                                    </div>
                                  ) : (
                                    <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                                      <img 
                                        src={`${API_BASE_URL}${proofUrl}`} 
                                        alt="Proof Preview" 
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <a 
                                      href={`${API_BASE_URL}${proofUrl}`} 
                                      target="_blank" 
                                      rel="noreferrer" 
                                      className="text-xs font-bold text-primary hover:underline truncate flex items-center gap-1"
                                    >
                                      <span>View Document</span>
                                      <ExternalLink className="w-3 h-3 shrink-0" />
                                    </a>
                                    <span className="text-[9px] text-slate-400 block truncate font-mono mt-0.5">
                                      Stored in MongoDB
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="p-3 bg-white border border-slate-100 rounded-xl flex flex-col gap-1 shadow-sm">
                                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Metadata</span>
                                  <span className="text-xs font-mono font-bold text-slate-900 truncate">{proofValue}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Audit & Validate Action Button */}
                          <button
                            onClick={handleAuditProof}
                            disabled={isAuditing || !['proof_uploaded', 'proof_submitted', 'verified'].includes(escrowStatus)}
                            className="w-full h-11 text-xs font-bold uppercase tracking-wider bg-white hover:bg-slate-50 border border-primary/20 text-primary rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                          >
                            {isAuditing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ShieldCheck className="w-4 h-4 mr-1 text-primary" />}
                            Audit & Validate Proof
                          </button>

                          {/* Audit Check Results */}
                          {auditResult && (
                            <div className="p-3 rounded-xl border space-y-2 bg-white shadow-sm">
                              {auditResult.status === 'unavailable' ? (
                                <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                                  <span>Automated check unavailable; buyer confirms manually</span>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-500 border-b pb-1.5">
                                    <span>Automated Verification Check</span>
                                    <span className={auditResult.looks_like_invoice ? "text-emerald-600 font-bold" : "text-amber-600 font-bold"}>
                                      {auditResult.looks_like_invoice ? "Invoice Format" : "Non-Standard Document"}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                                    <div>
                                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Invoice #</span>
                                      <span className="font-semibold text-slate-800">{auditResult.extracted.invoice_no || 'N/A'}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Date</span>
                                      <span className="font-semibold text-slate-800">{auditResult.extracted.date || 'N/A'}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Amount</span>
                                      <span className="font-semibold text-slate-800">
                                        {auditResult.extracted.amount != null ? `₹${auditResult.extracted.amount.toLocaleString()}` : 'N/A'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Supplier</span>
                                      <span className="font-semibold text-slate-800 truncate block">{auditResult.extracted.supplier_name || 'N/A'}</span>
                                    </div>
                                  </div>

                                  {auditResult.mismatches && auditResult.mismatches.length > 0 ? (
                                    <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg space-y-1">
                                      <p className="text-[10px] font-black text-red-700 uppercase tracking-wider">Detected Mismatches:</p>
                                      {auditResult.mismatches.map((m, idx) => (
                                        <p key={idx} className="text-xs text-red-600 font-medium leading-tight">• {m}</p>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                                      <p className="text-xs text-emerald-700 font-medium flex items-center gap-1.5">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                        No mismatches detected with order specifications.
                                      </p>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="pt-2 space-y-2">
                          <button
                            onClick={handleVerifyProof}
                            disabled={isVerifying || isVerified || !['proof_uploaded', 'proof_submitted'].includes(escrowStatus)}
                            className="w-full h-14 text-xs font-black uppercase tracking-widest bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 hover:to-indigo-500 text-white rounded-xl shadow-lg shadow-primary/20 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer"
                          >
                            {isVerifying ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2 text-indigo-200" />}
                            {isVerified ? "Delivery Verified" : "Finalize Verification"}
                          </button>
                          <p className="text-[9px] text-slate-400 text-center font-medium leading-relaxed">
                            The buyer makes the final decision. The automated check informs and never auto-approves.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100">
                      <button
                        onClick={handleConfirmDelivery}
                        disabled={isConfirming || !isVerified || escrowStatus === 'released'}
                        className={cn(
                          "w-full h-16 text-base font-black uppercase tracking-wider rounded-2xl shadow-xl transition-all duration-300 transform flex items-center justify-center gap-3 active:scale-[0.99] cursor-pointer disabled:pointer-events-none",
                          (isVerified && escrowStatus !== 'released')
                            ? "bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-emerald-500/30 hover:-translate-y-1 hover:shadow-emerald-500/40" 
                            : "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none border border-slate-200"
                        )}
                      >
                        {isConfirming ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Zap className={cn("w-5 h-5 transition-transform duration-300", isVerified ? "animate-pulse text-emerald-100" : "")} />
                        )}
                        {escrowStatus === 'released' 
                          ? "Settlement Initiated (simulated payout)" 
                          : (isVerified ? "Settlement initiated (simulated payout)" : "Verification Required to Release")}
                      </button>
                      
                      <p className="text-[9px] text-center text-slate-400 font-bold uppercase tracking-widest mt-4">
                        Settlement release is irreversible. The buyer confirms manually.
                      </p>
                    </div>

                    {/* Escrow Transaction History Timeline */}
                    {escrowRecord?.history && Array.isArray(escrowRecord.history) && escrowRecord.history.length > 0 && (
                      <div className="mt-8 pt-6 border-t border-slate-100 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-black uppercase tracking-widest text-slate-700 flex items-center gap-2">
                            <Clock className="w-4 h-4 text-slate-400" /> Escrow Transaction History
                          </h4>
                          <span className="text-[10px] font-mono text-slate-400">
                            {escrowRecord.history.length} Event{escrowRecord.history.length > 1 ? 's' : ''} Logged
                          </span>
                        </div>
                        <div className="space-y-2">
                          {escrowRecord.history.map((h: any, idx: number) => (
                            <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs gap-1">
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider",
                                  h.status === 'RELEASED' ? "bg-emerald-100 text-emerald-800" :
                                  h.status === 'VERIFIED' ? "bg-teal-100 text-teal-800" :
                                  h.status === 'PROOF_UPLOADED' ? "bg-blue-100 text-blue-800" :
                                  h.status === 'FUNDED' ? "bg-indigo-100 text-indigo-800" :
                                  "bg-slate-200 text-slate-700"
                                )}>
                                  {h.status}
                                </span>
                                <span className="text-slate-700 font-medium">{h.note || `Transitioned to ${h.status}`}</span>
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {h.timestamp ? new Date(h.timestamp).toLocaleString() : ''}
                                {h.actor ? ` • ${h.actor}` : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
              </>
            )}
          </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 'payment' && (
          <motion.div
            key="payment"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-2xl mx-auto"
          >
            <Card className="glass-card border-emerald-100 overflow-hidden shadow-xl shadow-emerald-100/50 p-0">
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-10 text-center text-white relative">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 12 }}
                  className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-md border border-white/30"
                >
                  <CheckCircle2 className="w-10 h-10" />
                </motion.div>
                <h2 className="text-2xl font-display font-bold mb-1">Procurement Commitment Secured</h2>
                <Badge className="bg-white/20 text-white border-white/30 mb-3 hover:bg-white/20">Settled in Escrow</Badge>
                <p className="text-emerald-50/80 max-w-sm mx-auto font-medium text-xs">Funds are held in escrow and released only after verified delivery. The procurement cycle is complete.</p>
              </div>

              <CardContent className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Supplier</span>
                    <span className="text-lg font-bold text-slate-900">{result?.selectedSupplier.name}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Amount Settled</span>
                    <span className="text-lg font-bold text-emerald-600">₹{result?.selectedSupplier.finalPrice.toLocaleString()}</span>
                  </div>
                  <div className="col-span-2 space-y-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Escrow Reference ID</span>
                    <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="font-mono text-xs text-primary font-bold truncate flex-1">
                        {txId}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Supplier Rating Card */}
                {!ratingSubmitted && (
                  <div className="pt-4 border-t border-slate-100">
                    <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100 rounded-2xl p-6 space-y-4">
                      <div className="flex items-center gap-2">
                        <Star className="w-5 h-5 text-violet-500" />
                        <h4 className="text-sm font-bold text-slate-900">Rate Your Supplier</h4>
                      </div>
                      
                      {/* Star Selector */}
                      <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            onClick={() => setRating(star)}
                            className={cn(
                              "transition-all duration-200 hover:scale-110",
                              star <= rating ? "text-yellow-400" : "text-slate-300"
                            )}
                          >
                            <Star className={cn("w-8 h-8", star <= rating && "fill-yellow-400")} />
                          </button>
                        ))}
                      </div>

                      {/* Review Textarea */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                          Review
                        </label>
                        <textarea
                          value={review}
                          onChange={(e) => setReview(e.target.value)}
                          placeholder="Share your experience with this supplier..."
                          className="w-full h-24 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all resize-none"
                        />
                      </div>

                      {/* Submit Rating Button */}
                      <Button
                        onClick={handleSubmitRating}
                        disabled={rating === 0 || isSubmittingRating}
                        className="w-full h-12 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl shadow-lg shadow-violet-500/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98] flex items-center justify-center gap-2"
                      >
                        {isSubmittingRating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          <>
                            <Star className="w-4 h-4" />
                            Submit Rating
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Rating Submitted Success Message */}
                {ratingSubmitted && (
                  <div className="pt-4 border-t border-slate-100">
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 flex items-center gap-4">
                      <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-bold text-emerald-900">Rating Submitted Successfully</h4>
                        <p className="text-xs text-emerald-700 mt-1">Thank you for your feedback. This helps improve our supplier recommendation system.</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                  <button
                    onClick={() => setStep('form')}
                    className="flex-1 h-14 text-sm font-bold tracking-wide border border-slate-200 bg-white hover:bg-slate-50 rounded-xl text-slate-600 transition-all duration-300 hover:border-slate-300 hover:-translate-y-0.5 hover:shadow-sm flex items-center justify-center cursor-pointer"
                  >
                    New Procurement
                  </button>
                  <button
                    onClick={() => window.location.href = '/transactions'}
                    className="flex-1 h-14 text-sm font-bold tracking-wide bg-gradient-to-r from-primary to-slate-900 hover:from-primary/95 hover:to-slate-850 text-white rounded-xl shadow-lg shadow-primary/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Activity className="w-4 h-4 text-primary-foreground/80" /> View History
                  </button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(isExecuting || isConfirming) && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#0A2540]/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col items-center text-center"
            >
              {/* Top progress bar */}
              <div className="absolute top-0 left-0 w-full h-1 bg-slate-100 overflow-hidden z-10">
                <motion.div
                  className="h-full bg-primary"
                  animate={{ x: ["-100%", "200%"] }}
                  transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}
                  style={{ width: "45%" }}
                />
              </div>

              <div className="p-10 flex flex-col items-center">
                {/* Main spinner */}
                <div className="relative mb-8 mt-4">
                  <div className="w-28 h-28 rounded-full flex items-center justify-center relative">
                    {/* Outer spinning ring */}
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 2.5, ease: "linear" }}
                      className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-primary border-r-primary/40"
                    />
                    {/* Middle ring */}
                    <motion.div
                      animate={{ rotate: -360 }}
                      transition={{ repeat: Infinity, duration: 1.8, ease: "linear" }}
                      className="absolute inset-3 rounded-full border-[3px] border-transparent border-t-amber-400 border-l-amber-400/30"
                    />
                    {/* Center icon */}
                    <motion.div
                      animate={{ scale: [0.95, 1.05, 0.95] }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                      className={`w-14 h-14 rounded-full flex items-center justify-center shadow-md ${isConfirming ? 'bg-emerald-50' : 'bg-amber-50'
                        }`}
                    >
                      {isConfirming
                        ? <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                        : <Lock className="w-7 h-7 text-amber-500" />}
                    </motion.div>
                  </div>

                  {/* Escrow animation badge */}
                  <motion.div
                    animate={{ y: [-5, -25], opacity: [0, 1, 0], scale: [0.8, 1, 0.8] }}
                    transition={{ repeat: Infinity, duration: 1.2, ease: "easeOut" }}
                    className="absolute left-1/2 bottom-0 -ml-3.5 w-7 h-7 bg-emerald-500 rounded-full shadow-lg border-2 border-emerald-300 flex items-center justify-center z-20"
                  >
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </motion.div>
                </div>

                {/* Phase-specific message */}
                <AnimatePresence mode="wait">
                  {isExecuting ? (
                    <motion.div
                      key={paymentPhase}
                      className="flex flex-col items-center"
                    >
                      <h3 className="font-display font-bold text-2xl text-slate-900 mb-2 tracking-tight">
                        {[
                          'Initializing Protocol...',
                          'Securing Commitment...',
                          'Anchoring Contract...',
                          'Finalizing Authorization...',
                        ][paymentPhase]}
                      </h3>
                      <p className="text-slate-500 font-medium text-sm leading-relaxed max-w-[220px]">
                        {[
                          'Establishing agentic channel for the procurement cycle.',
                          'Securing procurement commitment in simulated escrow.',
                          'Anchoring digital contract terms to the audit record.',
                          'Finalizing machine-to-machine authorization for settlement.',
                        ][paymentPhase]}
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="confirming"
                      className="flex flex-col items-center"
                    >
                      <h3 className="font-display font-bold text-2xl text-slate-900 mb-2 tracking-tight">Securing Commitment...</h3>
                      <p className="text-slate-500 font-medium text-sm leading-relaxed max-w-[220px]">Holding procurement commitment in escrow. Please wait.</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Supplier Detail Modal */}
      <AnimatePresence>
        {showSupplierDetails && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSupplierDetails(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="bg-slate-900 p-8 text-white relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent opacity-50" />
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setShowSupplierDetails(null)}
                  className="absolute top-6 right-6 text-white/40 hover:text-white hover:bg-white/10 rounded-full"
                >
                  <ArrowRight className="w-5 h-5" />
                </Button>
                
                <div className="flex items-center gap-4 mb-6 relative z-10">
                  <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md">
                    <ShieldCheck className="w-7 h-7 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-display font-bold">{showSupplierDetails.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-none text-[8px] font-black uppercase tracking-widest">Verified Supplier</Badge>
                      <span className="text-[10px] text-white/40 font-bold">ID: #{showSupplierDetails.id}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 relative z-10">
                  <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                    <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">Reliability Score</p>
                    <p className="text-3xl font-display font-bold text-emerald-400">{showSupplierDetails.reliability}%</p>
                  </div>
                  <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                    <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">Success Rate</p>
                    <p className="text-3xl font-display font-bold text-primary">{showSupplierDetails.success_rate}%</p>
                  </div>
                </div>
              </div>

              <div className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Performance History</h4>
                    <span className="text-[9px] font-bold text-slate-400">
                      Last Updated: {showSupplierDetails.last_updated ? new Date(showSupplierDetails.last_updated).toLocaleString() : 'Just now'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Total Deals</p>
                      <p className="text-lg font-bold text-slate-900">{showSupplierDetails.total_deals || 120}</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Successful</p>
                      <p className="text-lg font-bold text-emerald-600">{showSupplierDetails.successful_deals || 115}</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">On-time</p>
                      <p className="text-lg font-bold text-blue-600">{showSupplierDetails.on_time_deliveries || 110}</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Late / Failed</p>
                      <p className="text-lg font-bold text-rose-500">{showSupplierDetails.late_deliveries || 10}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                   <div className="flex items-center justify-between px-1">
                     <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Verification Hash</h4>
                     <Badge variant="outline" className="text-[8px] font-black bg-emerald-50 text-emerald-600 border-emerald-100">AUDIT VERIFIED</Badge>
                   </div>
                   <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 flex items-center gap-3">
                     <Lock className="w-4 h-4 text-emerald-500 shrink-0" />
                     <code className="text-[10px] font-mono text-emerald-400/80 break-all leading-relaxed">
                       {showSupplierDetails.reputation_hash || '0x7d8e2f1a9c4b5d6e7f8a9b0c1d2e3f4a5b6c7d8e2f1a9c4b5d6e7f8a9b0c1d2e'}
                     </code>
                   </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <Button 
                    onClick={() => setShowSupplierDetails(null)}
                    className="w-full h-14 bg-slate-900 hover:bg-black text-white font-bold rounded-2xl shadow-xl"
                  >
                    Close Insights
                  </Button>
                </div>

                <p className="text-[9px] text-center text-slate-400 font-bold uppercase tracking-widest leading-relaxed">
                  Reputation evolves after every completed escrow settlement.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Procurement;
