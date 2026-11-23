import React from 'react';
import { 
  HelpCircle, 
  Search, 
  Book, 
  Mail, 
  ExternalLink, 
  ChevronRight,
  Shield,
  ShieldCheck,
  FileText
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

export default function Help() {
  const faqs = [
    {
      question: "How does AI supplier discovery work?",
      answer: "ProcureAI searches cached Alibaba supplier listings matching your product specifications, lead times, and quantity requirements, ranking partners by trust metrics.",
      icon: Search
    },
    {
      question: "How are escrow commitments secured?",
      answer: "Payments are processed through the Cashfree payment gateway in sandbox mode. Funds remain locked in escrow until delivery proof is reviewed and verified.",
      icon: ShieldCheck
    },
    {
      question: "How do RFQs work?",
      answer: "When you select a supplier, ProcureAI generates a formal Request for Quotation (RFQ) PDF that can be dispatched directly to the supplier's contact email.",
      icon: FileText
    }
  ];

  return (
    <div className="space-y-12 max-w-4xl mx-auto pb-16 pt-4 px-2">
      <div className="text-center space-y-3">
        <h1 className="text-[clamp(1.5rem,2.5vw,2.25rem)] font-display font-bold tracking-tight text-slate-950">
          Help & Support
        </h1>
        <p className="text-slate-500 max-w-lg mx-auto text-sm">
          Guides, frequently asked questions, and assistance for your procurement workflows.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Card className="bg-white border-slate-200 shadow-sm rounded-2xl hover:border-slate-300 transition-all p-6 text-center">
          <div className="w-12 h-12 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center mx-auto mb-4 text-slate-800">
            <Book className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">Documentation</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Detailed guides on supplier discovery, RFQs, and escrow commitments.
          </p>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm rounded-2xl hover:border-slate-300 transition-all p-6 text-center">
          <div className="w-12 h-12 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center mx-auto mb-4 text-slate-800">
            <Mail className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">Support Contact</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Email our team for support or inquiries regarding the BUILD 2036 prototype.
          </p>
        </Card>
      </div>

      <div className="space-y-5">
        <h2 className="text-lg font-bold flex items-center gap-2 text-slate-950">
          <HelpCircle className="w-5 h-5 text-slate-700" />
          Frequently Asked Questions
        </h2>
        <div className="grid grid-cols-1 gap-3">
          {faqs.map((faq) => (
            <Card key={faq.question} className="bg-white border-slate-200 shadow-sm rounded-xl">
              <CardContent className="p-5 flex items-start gap-4">
                <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0 text-slate-700">
                  <faq.icon className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm text-slate-900 mb-1">{faq.question}</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">{faq.answer}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
