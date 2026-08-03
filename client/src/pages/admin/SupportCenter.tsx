import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import { Inbox, Clock, CheckCircle, Ticket, AlertTriangle, User, Shield, Tag, Search, MessageSquare, Cpu } from "lucide-react";

export default function SupportCenter() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [filter, setFilter] = useState("open");
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [internalNotes, setInternalNotes] = useState<string[]>([]);

  useEffect(() => {
    fetchTickets();
  }, [filter]);

  useEffect(() => {
    if (selectedTicket?.conversation_id) {
      fetchMessages(selectedTicket.conversation_id);
    } else {
      setMessages([]);
    }
    if (selectedTicket?.internal_notes) {
      setInternalNotes(Array.isArray(selectedTicket.internal_notes) ? selectedTicket.internal_notes : [selectedTicket.internal_notes]);
    } else {
      setInternalNotes([]);
    }
  }, [selectedTicket]);

  const fetchTickets = async () => {
    let query = supabase
      .from("support_tickets")
      .select("*, customer:profiles!support_tickets_customer_id_fkey(full_name, avatar_url)")
      .order("created_at", { ascending: false });

    if (filter === "open") {
      query = query.in("status", ["open", "escalated", "waiting"]);
    } else if (filter === "assigned") {
      if (user?.id) query = query.eq("assigned_admin_id", user.id);
    } else if (filter === "waiting") {
      query = query.eq("status", "waiting");
    } else if (filter === "resolved") {
      query = query.in("status", ["resolved", "closed"]);
    }

    const { data } = await query;
    if (data) {
      setTickets(data);
    }
  };

  const fetchMessages = async (conversationId: string) => {
    setLoadingMessages(true);
    try {
      const { data } = await supabase
        .from("messages")
        .select("id, sender_id, content, created_at, sender:profiles!messages_sender_id_fkey(full_name)")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      setMessages(data || []);
    } catch {
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || !selectedTicket?.id) return;
    const newNotes = [...internalNotes, `${new Date().toLocaleTimeString()}: ${noteText.trim()}`];
    try {
      await supabase
        .from("support_tickets")
        .update({ internal_notes: newNotes })
        .eq("id", selectedTicket.id);
      setInternalNotes(newNotes);
      setNoteText("");
    } catch (err) {
      console.error("Failed to add note", err);
    }
  };

  const handleAssignToMe = async () => {
    if (!selectedTicket?.id || !user?.id) return;
    await supabase.from("support_tickets").update({ assigned_admin_id: user.id, status: "open" }).eq("id", selectedTicket.id);
    setSelectedTicket((prev: any) => ({ ...prev, assigned_admin_id: user.id, status: "open" }));
    fetchTickets();
  };

  const handleResolve = async () => {
    if (!selectedTicket?.id) return;
    await supabase.from("support_tickets").update({ status: "resolved" }).eq("id", selectedTicket.id);
    setSelectedTicket((prev: any) => ({ ...prev, status: "resolved" }));
    fetchTickets();
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "bg-red-500/20 text-red-500";
      case "high": return "bg-orange-500/20 text-orange-500";
      case "normal": return "bg-blue-500/20 text-blue-500";
      default: return "bg-gray-500/20 text-gray-500";
    }
  };

  return (
    <div className="flex h-screen bg-[#0A0A0A] text-white">
      {/* Sidebar / Queues */}
      <div className="w-64 border-r border-white/10 flex flex-col">
        <div className="p-4 border-b border-white/10">
          <h2 className="text-xl font-bold flex items-center gap-2"><Shield size={20} className="text-blue-500"/> Support Center</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Queues</div>
          
          <button className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${filter === "open" ? "bg-blue-500/10 text-blue-500" : "hover:bg-white/5"}`} onClick={() => setFilter("open")}>
            <Inbox size={16} /> Open Tickets
          </button>
          
          <button className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${filter === "assigned" ? "bg-blue-500/10 text-blue-500" : "hover:bg-white/5"}`} onClick={() => setFilter("assigned")}>
            <User size={16} /> Assigned to Me
          </button>
          
          <button className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${filter === "waiting" ? "bg-blue-500/10 text-blue-500" : "hover:bg-white/5"}`} onClick={() => setFilter("waiting")}>
            <Clock size={16} /> Waiting on Customer
          </button>
          
          <button className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${filter === "resolved" ? "bg-blue-500/10 text-blue-500" : "hover:bg-white/5"}`} onClick={() => setFilter("resolved")}>
            <CheckCircle size={16} /> Resolved
          </button>
          
          <div className="mt-8 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Agents</div>
          <div className="flex items-center gap-2 px-3 py-1.5 text-sm">
            <div className="w-2 h-2 rounded-full bg-green-500"></div> NoteStandard Support
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 text-sm">
            <div className="w-2 h-2 rounded-full bg-yellow-500"></div> AI Assistant
          </div>
        </div>
      </div>

      {/* Ticket List */}
      <div className="w-96 border-r border-white/10 flex flex-col">
        <div className="p-4 border-b border-white/10 relative">
          <Search size={16} className="absolute left-7 top-7 text-gray-500" />
          <input type="text" placeholder="Search tickets..." className="w-full bg-[#1A1A1D] border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors" />
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {tickets.map((ticket: any) => (
            <div key={ticket.id} onClick={() => setSelectedTicket(ticket)} className={`p-4 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors ${selectedTicket?.id === ticket.id ? "bg-white/5" : ""}`}>
              <div className="flex justify-between items-start mb-2">
                <span className="font-semibold text-sm truncate">{ticket.customer?.full_name || "Customer Account"}</span>
                <span className="text-xs text-gray-500">{new Date(ticket.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="text-xs text-gray-400 mb-3 truncate">
                {ticket.category} - {ticket.intent || ticket.subject || 'General Support'}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getPriorityColor(ticket.priority)} uppercase tracking-wide`}>
                  {ticket.priority || 'normal'}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1A1A1D] border border-white/10 text-gray-300">
                  {ticket.status}
                </span>
              </div>
            </div>
          ))}
          {tickets.length === 0 && (
            <div className="p-8 text-center text-gray-500 text-sm">
              No support tickets found in this queue.
            </div>
          )}
        </div>
      </div>

      {/* Ticket Details */}
      <div className="flex-1 flex flex-col bg-[#111111]">
        {selectedTicket ? (
          <>
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-[#0A0A0A]">
              <div>
                <h3 className="text-lg font-bold mb-1">Ticket #{selectedTicket.id.split("-")[0]}</h3>
                <div className="text-sm text-gray-400 flex items-center gap-4">
                  <span className="flex items-center gap-1"><User size={14}/> {selectedTicket.customer?.full_name || 'Customer'}</span>
                  <span className="flex items-center gap-1"><Tag size={14}/> {selectedTicket.category}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleAssignToMe} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors">Assign to Me</button>
                <button onClick={handleResolve} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-medium transition-colors">Resolve</button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* AI Handoff Indicator */}
              <div className="bg-[#1A1A1D] border border-white/10 rounded-xl p-5 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-purple-500"></div>
                <h4 className="text-sm font-bold flex items-center gap-2 text-purple-400 mb-4"><Cpu size={16} /> AI Handoff Summary</h4>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500 text-xs mb-1 uppercase tracking-wider">Customer Problem</div>
                    <div className="font-medium">{selectedTicket.ai_debug_metadata?.customer_problem || selectedTicket.intent || "Direct Inquiry"}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs mb-1 uppercase tracking-wider">Confidence Score</div>
                    <div className="font-medium">{selectedTicket.confidence ? `${(selectedTicket.confidence * 100).toFixed(0)}%` : '100%'}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs mb-1 uppercase tracking-wider">Escalation Reason</div>
                    <div className="font-medium text-orange-400">{selectedTicket.ai_debug_metadata?.escalation_reason || "Escalated for Agent Action"}</div>
                  </div>
                </div>
              </div>

              {/* Conversation Timeline */}
              <div>
                <h4 className="text-sm font-bold flex items-center gap-2 mb-4 text-gray-300"><MessageSquare size={16}/> Conversation History</h4>
                {loadingMessages ? (
                  <div className="bg-[#1A1A1D] border border-white/10 rounded-xl p-6 text-center text-gray-400 text-sm">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="bg-[#1A1A1D] border border-white/10 rounded-xl p-6 text-center text-gray-500 text-sm">No recorded conversation messages for this ticket.</div>
                ) : (
                  <div className="bg-[#1A1A1D] border border-white/10 rounded-xl p-4 space-y-3">
                    {messages.map((m: any) => (
                      <div key={m.id} className="p-3 rounded-lg bg-black/40 border border-white/5 space-y-1">
                        <div className="flex justify-between text-xs text-gray-400">
                          <span className="font-semibold text-white">{m.sender?.full_name || 'User'}</span>
                          <span>{new Date(m.created_at).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-sm text-gray-200">{m.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Internal Notes */}
              <div>
                <h4 className="text-sm font-bold flex items-center gap-2 mb-4 text-gray-300"><Ticket size={16}/> Internal Notes</h4>
                {internalNotes.length > 0 && (
                  <div className="mb-3 space-y-2">
                    {internalNotes.map((note, idx) => (
                      <div key={idx} className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">{note}</div>
                    ))}
                  </div>
                )}
                <div className="bg-[#1A1A1D] border border-white/10 rounded-xl p-4">
                   <textarea
                     className="w-full bg-transparent border-none outline-none text-sm resize-none text-white"
                     placeholder="Add an internal note for other agents..."
                     rows={3}
                     value={noteText}
                     onChange={e => setNoteText(e.target.value)}
                   />
                   <div className="flex justify-end mt-2">
                     <button onClick={handleAddNote} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-medium transition-colors">Add Note</button>
                   </div>
                </div>
              </div>

            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Select a ticket from the queue to view details.
          </div>
        )}
      </div>
    </div>
  );
}


