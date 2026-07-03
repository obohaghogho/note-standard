import { useEffect, useState } from "react";
import { ErrorBoundary } from "../../components/common/ErrorBoundary";
import { Card } from "../../components/common/Card";
import { Button } from "../../components/common/Button";
import { Dropdown } from "../../components/common/Dropdown";
import { EditNoteModal } from "../../components/dashboard/EditNoteModal";
import { ViewNoteModal } from "../../components/dashboard/ViewNoteModal";
import { ShareNoteModal } from "../../components/dashboard/ShareNoteModal";
import { DeleteNoteModal } from "../../components/dashboard/DeleteNoteModal";
import { Grid, List as ListIcon, Edit2, Share2, Trash2, Pin, Calendar, Flame, Keyboard, Layout, Settings2, Plus, Sparkles, FolderOpen, AlignLeft } from "lucide-react";
import { supabase } from "../../lib/supabaseSafe";
import { useAuth } from "../../context/AuthContext";
import { useNotes } from "../../context/NotesContext";
import { useNotesDashboard } from "../../context/NotesDashboardContext";
import { toast } from "react-hot-toast";
import { cn } from "../../utils/cn";

import { WelcomeHeader } from "../../components/notes-dashboard/WelcomeHeader";
import { StatCardGrid } from "../../components/notes-dashboard/StatCardGrid";
import { QuickActionsBar } from "../../components/notes-dashboard/QuickActionsBar";
import { RecentNotesScroller } from "../../components/notes-dashboard/RecentNotesScroller";
import { CategoryList } from "../../components/notes-dashboard/CategoryList";
import { ActivityTimeline } from "../../components/notes-dashboard/ActivityTimeline";
import { CalendarWidget } from "../../components/notes-dashboard/CalendarWidget";
import { SmartSuggestions } from "../../components/notes-dashboard/SmartSuggestions";
import { GlobalSearch } from "../../components/notes-dashboard/GlobalSearch";
import { LayoutCustomizer } from "../../components/notes-dashboard/LayoutCustomizer";
import { TrashRecoveryModal } from "../../components/dashboard/TrashRecoveryModal";

import type { Note } from "../../types/note";

function NotesContent() {
  const { user } = useAuth();
  const { notes, loading, refreshNotes, setNotes } = useNotes();
  const { widgets, refreshDashboard } = useNotesDashboard();

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState<"latest" | "oldest" | "title">("latest");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [isConfiguringLayout, setIsConfiguringLayout] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);

  // Modal States
  const [viewingNote, setViewingNote] = useState<Note | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [sharingNoteId, setSharingNoteId] = useState<string | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch and filter notes
  useEffect(() => {
    refreshNotes("", sortBy);
  }, [user, sortBy, refreshNotes]);

  // Filter notes by selected category locally
  const filteredNotes = selectedCategoryId
    ? notes.filter((n) => n.category_id === selectedCategoryId)
    : notes;

  const handleDelete = (noteId: string) => {
    setDeletingNoteId(noteId);
  };

  const confirmDelete = async () => {
    if (!deletingNoteId || !user) return;
    setIsDeleting(true);

    try {
      const { error } = await supabase
        .from("notes")
        .update({ deleted_at: new Date().toISOString() }) // Soft delete!
        .eq("id", deletingNoteId)
        .eq("owner_id", user.id);

      if (error) throw error;
      toast.success("Note moved to trash");
      setNotes((prev) => prev.filter((n) => n.id !== deletingNoteId));
      refreshNotes("", sortBy);
      refreshDashboard();
    } catch (error) {
      console.error("Error deleting note:", error);
      toast.error("Failed to delete note");
    } finally {
      setIsDeleting(false);
      setDeletingNoteId(null);
    }
  };

  const handleCreateNoteTrigger = async (type = "text") => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("notes")
        .insert([
          {
            owner_id: user.id,
            title: "Untitled Note",
            content: "",
            note_type: type,
            is_private: true,
            version: 1,
            last_opened_at: new Date().toISOString(),
          },
        ])
        .select();

      if (error) throw error;
      toast.success("Blank note created!");
      const newNote = data[0] as Note;
      setNotes((prev) => [newNote, ...prev]);
      refreshNotes("", sortBy);
      refreshDashboard();
      setEditingNote(newNote);
    } catch (err) {
      console.error(err);
      toast.error("Failed to create note");
    }
  };

  // Keyboard shortcuts listener
  useEffect(() => {
    const handleShortcuts = (e: KeyboardEvent) => {
      // Ctrl + N -> New Note
      if (e.ctrlKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleCreateNoteTrigger("text");
      }
    };
    window.addEventListener("keydown", handleShortcuts);
    return () => window.removeEventListener("keydown", handleShortcuts);
  }, [user]);

  // Render registered widgets based on user configuration layout
  const renderWidget = (widgetName: string) => {
    switch (widgetName) {
      case "welcome":
        return <WelcomeHeader />;
      case "stats":
        return <StatCardGrid />;
      case "actions":
        return (
          <QuickActionsBar
            onNewNote={handleCreateNoteTrigger}
            onOpenAi={() => toast.success("AI Copilot opened. Try typing Ctrl+/")}
          />
        );
      case "recent":
        return (
          <div className="space-y-3">
            <h3 className="text-white font-bold text-xs uppercase tracking-wider">Recently Opened</h3>
            <RecentNotesScroller onSelectNote={(id) => setViewingNote(notes.find(n => n.id === id) || null)} />
          </div>
        );
      case "categories":
        return (
          <div className="space-y-3">
            <h3 className="text-white font-bold text-xs uppercase tracking-wider">Folders & Categories</h3>
            <CategoryList
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={setSelectedCategoryId}
            />
          </div>
        );
      case "calendar":
        return <CalendarWidget onSelectNote={(id) => setViewingNote(notes.find(n => n.id === id) || null)} />;
      case "timeline":
        return <ActivityTimeline />;
      case "suggestions":
        return (
          <SmartSuggestions
            onSelectNote={(id) => setViewingNote(notes.find(n => n.id === id) || null)}
            onRefresh={refreshDashboard}
          />
        );
      case "shared":
        return (
          <div className="border border-white/10 rounded-2xl bg-neutral-900/50 p-4 text-center">
            <p className="text-white font-bold text-xs">Shared Workspaces</p>
            <p className="text-neutral-500 text-[10px] mt-0.5 font-bold">Collaborators will appear here.</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-8 bg-[#050505] min-h-screen text-white pb-10">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Workspace Hub
            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
              Premium
            </span>
          </h1>
          <p className="text-neutral-500 text-xs mt-1">Manage your knowledge base, checklists, and AI insights.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <GlobalSearch onSelectNote={(id) => setViewingNote(notes.find(n => n.id === id) || null)} />
          <button
            onClick={() => setIsTrashOpen(true)}
            className="p-2.5 rounded-xl border border-white/10 bg-neutral-900 text-neutral-400 hover:text-white transition-all cursor-pointer"
            title="Open Trash"
          >
            <Trash2 className="w-5 h-5 text-red-400" />
          </button>
          <button
            onClick={() => setIsConfiguringLayout(!isConfiguringLayout)}
            className={cn(
              "p-2.5 rounded-xl border transition-all cursor-pointer",
              isConfiguringLayout
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-white/10 bg-neutral-900 text-neutral-400 hover:text-white"
            )}
            title="Configure widgets"
          >
            <Settings2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 2. Layout Customizer panel (Visible when toggled) */}
      {isConfiguringLayout && (
        <div className="transition-all duration-300">
          <LayoutCustomizer />
        </div>
      )}

      {/* 3. Render Dashboard Widgets dynamically based on Layout Registry */}
      <div className="flex flex-col gap-6">
        {widgets
          .filter((w) => w.visible)
          .map((w) => (
            <div
              key={w.widget}
              className={cn(
                "w-full transition-all duration-300",
                w.width === "half" ? "lg:w-1/2 inline-block lg:pr-3 vertical-top" : "w-full"
              )}
            >
              {renderWidget(w.widget)}
            </div>
          ))}
      </div>

      {/* 4. Main Notes Feed (All remaining notes list) */}
      <div className="space-y-4 pt-6 border-t border-white/5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-emerald-400" />
            Notes Directory
          </h2>
          <div className="flex items-center gap-3">
            <div className="bg-neutral-900 p-1 rounded-xl border border-white/10 flex">
              <button
                onClick={() => setViewMode("grid")}
                className={cn(
                  "p-2 rounded-lg cursor-pointer transition-colors",
                  viewMode === "grid" ? "text-white bg-white/10" : "text-neutral-500 hover:text-white"
                )}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "p-2 rounded-lg cursor-pointer transition-colors",
                  viewMode === "list" ? "text-white bg-white/10" : "text-neutral-500 hover:text-white"
                )}
              >
                <ListIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-neutral-400 text-center py-10">Loading notes directory...</div>
        ) : filteredNotes.length === 0 ? (
          <div className="text-neutral-500 text-center py-12 border border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
            <FolderOpen className="w-10 h-10 mx-auto mb-2 text-neutral-600" />
            <p className="text-sm font-semibold">No notes in this category.</p>
            <button
              onClick={() => handleCreateNoteTrigger("text")}
              className="mt-3 text-xs text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1.5 mx-auto cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Create a note
            </button>
          </div>
        ) : (
          <div
            className={cn(
              viewMode === "grid"
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                : "flex flex-col gap-3"
            )}
          >
            {filteredNotes.map((note) => (
              <Card
                key={note.id}
                hoverEffect
                className={cn(
                  "cursor-pointer bg-neutral-900/40 border border-white/10 hover:border-white/20 transition-all flex flex-col justify-between group overflow-hidden relative",
                  viewMode === "grid" ? "p-5 h-[180px]" : "p-4 flex-row items-center gap-4 h-auto"
                )}
                onClick={() => setViewingNote(note)}
                style={note.color ? { borderLeft: `4px solid ${note.color}` } : undefined}
              >
                {note.cover_image && viewMode === "grid" && (
                  <div className="absolute inset-0 h-8 w-full bg-gradient-to-r opacity-10 pointer-events-none"
                       style={{ backgroundImage: note.cover_image.includes("url") ? note.cover_image : `linear-gradient(${note.cover_image})` }} />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 relative z-10">
                    <span className="text-[10px] text-neutral-500 font-bold">
                      {new Date(note.created_at).toLocaleDateString()}
                    </span>
                    {!note.is_private && (
                      <span className="text-[8px] bg-emerald-500/20 text-emerald-400 font-extrabold px-1.5 py-0.5 rounded uppercase">
                        Public
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-base text-white group-hover:text-emerald-400 transition-colors truncate mb-1 relative z-10">
                    {note.title || "Untitled Note"}
                  </h3>
                  {viewMode === "grid" && (
                    <p className="text-neutral-400 text-xs line-clamp-3 leading-relaxed relative z-10">
                      {note.content || "No content..."}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5 relative z-10">
                  <span className="flex items-center gap-1 text-[10px] text-neutral-500 font-bold">
                    <AlignLeft className="w-3 h-3 text-neutral-600" />
                    {note.word_count || 0} words
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSharingNoteId(note.id);
                      }}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white cursor-pointer transition-colors"
                      title="Share"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(note.id);
                      }}
                      className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 cursor-pointer transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {viewingNote && (
        <ViewNoteModal
          isOpen={!!viewingNote}
          onClose={() => setViewingNote(null)}
          note={viewingNote}
          onEdit={() => {
            setEditingNote(viewingNote);
            setViewingNote(null);
          }}
          onShare={() => {
            setSharingNoteId(viewingNote.id);
            setViewingNote(null);
          }}
        />
      )}

      {editingNote && (
        <EditNoteModal
          isOpen={!!editingNote}
          onClose={() => setEditingNote(null)}
          note={editingNote}
          onNoteUpdated={() => refreshNotes("", sortBy)}
        />
      )}

      {sharingNoteId && (
        <ShareNoteModal
          isOpen={!!sharingNoteId}
          onClose={() => setSharingNoteId(null)}
          noteId={sharingNoteId}
        />
      )}

      {deletingNoteId && (
        <DeleteNoteModal
          isOpen={!!deletingNoteId}
          onClose={() => !isDeleting && setDeletingNoteId(null)}
          onConfirm={confirmDelete}
          loading={isDeleting}
        />
      )}

      <TrashRecoveryModal
        isOpen={isTrashOpen}
        onClose={() => setIsTrashOpen(false)}
        onRestoreCompleted={() => {
          refreshNotes("", sortBy);
          refreshDashboard();
        }}
      />
    </div>
  );
}

export default function Notes() {
  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-red-500 bg-red-500/5 rounded-xl border border-red-500/10">
          Something went wrong loading your workspace.{" "}
          <button onClick={() => window.location.reload()} className="underline ml-2">
            Try again
          </button>
        </div>
      }
    >
      <NotesContent />
    </ErrorBoundary>
  );
}
