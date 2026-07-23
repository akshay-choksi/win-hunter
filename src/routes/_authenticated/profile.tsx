import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AVATAR_MAX_BYTES,
  AVATAR_MIME,
  DISPLAY_NAME_MAX,
  avatarExtForMime,
  avatarObjectPathFromUrl,
  initialsFromName,
} from "@/lib/profile";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuth();
  const { profile, loading, refresh } = useProfile();
  const fileRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.full_name ?? "");
    setAvatarUrl(profile.avatar_url);
    setPendingFile(null);
    setRemoveAvatar(false);
  }, [profile?.id, profile?.full_name, profile?.avatar_url]);

  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  const shownAvatar = removeAvatar ? null : previewUrl ?? avatarUrl;
  const initials = initialsFromName(displayName || profile?.full_name, user?.email);

  function onPickFile(file: File | null) {
    if (!file) return;
    if (!AVATAR_MIME.has(file.type)) {
      toast.error("Use a JPEG, PNG, or WebP image");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error("Image must be 2MB or smaller");
      return;
    }
    setPendingFile(file);
    setRemoveAvatar(false);
  }

  async function save() {
    if (!user) return;
    const name = displayName.trim();
    if (!name) {
      toast.error("Display name is required");
      return;
    }
    if (name.length > DISPLAY_NAME_MAX) {
      toast.error(`Display name must be ${DISPLAY_NAME_MAX} characters or fewer`);
      return;
    }

    setSaving(true);
    try {
      let nextAvatarUrl = removeAvatar ? null : avatarUrl;

      if (pendingFile) {
        const ext = avatarExtForMime(pendingFile.type);
        if (!ext) throw new Error("Unsupported image type");
        const path = `${user.id}/avatar.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, pendingFile, { upsert: true, contentType: pendingFile.type });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        // Cache-bust so the header picks up the new file immediately.
        nextAvatarUrl = `${data.publicUrl}?v=${Date.now()}`;
      } else if (removeAvatar) {
        const oldPath = avatarObjectPathFromUrl(avatarUrl);
        if (oldPath) {
          await supabase.storage.from("avatars").remove([oldPath]);
        }
        nextAvatarUrl = null;
      }

      const { error } = await supabase
        .from("profiles")
        .update({ full_name: name, avatar_url: nextAvatarUrl })
        .eq("id", user.id);
      if (error) throw error;

      setAvatarUrl(nextAvatarUrl);
      setPendingFile(null);
      setRemoveAvatar(false);
      await refresh();
      window.dispatchEvent(new Event("profile-updated"));
      toast.success("Profile saved");
    } catch (err) {
      toast.error("Could not save profile", {
        description: err instanceof Error ? err.message : "Try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading && !profile) {
    return <div className="text-sm text-muted-foreground">Loading profile…</div>;
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Profile"
        description="Set how your name and photo appear on league boards."
      />

      <div className="space-y-6 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <Avatar className="h-24 w-24 border border-border/80 shadow-sm">
            {shownAvatar ? <AvatarImage src={shownAvatar} alt="" /> : null}
            <AvatarFallback className="bg-navy text-lg font-semibold text-navy-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="flex flex-1 flex-col gap-2 text-center sm:text-left">
            <p className="text-sm font-medium text-foreground">Profile photo</p>
            <p className="text-xs text-muted-foreground">JPEG, PNG, or WebP · max 2MB</p>
            <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={saving}
              >
                <Camera className="h-4 w-4" />
                {shownAvatar ? "Change photo" : "Upload photo"}
              </Button>
              {shownAvatar ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    setPendingFile(null);
                    setRemoveAvatar(true);
                  }}
                  disabled={saving}
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </Button>
              ) : null}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="display-name">Display name</Label>
          <Input
            id="display-name"
            value={displayName}
            maxLength={DISPLAY_NAME_MAX}
            placeholder="Your name"
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={saving}
          />
          <p className="text-xs text-muted-foreground">
            {displayName.trim().length}/{DISPLAY_NAME_MAX}
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <UserRound className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{user?.email ?? "Signed in"}</span>
        </div>

        <Button type="button" onClick={save} disabled={saving} className="w-full sm:w-auto">
          {saving ? <Loader2 className="animate-spin" /> : null}
          {saving ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </div>
  );
}
