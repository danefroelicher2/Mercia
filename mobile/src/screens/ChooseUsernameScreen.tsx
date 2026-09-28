import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProfile } from '../context/ProfileContext';
import { checkUsername, saveMyProfile } from '../services/profile';
import { BIO_MAX, BIO_MAX_LINES, DISPLAY_NAME_MAX, USERNAME_MAX, normalizeUsername, usernameProblem } from '../utils/usernames';
import Avatar from '../components/people/Avatar';
import { useProfilePhoto } from '../hooks/useProfilePhoto';

// "Choose your username": shown once, required, right after any sign-up
// (email, Google or Apple) — mode "setup". The same screen opens from
// Profile → Edit to change username or name — mode "edit".

type Status =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok' }
  | { kind: 'bad'; reason: string }
  | { kind: 'unknown' }; // couldn't reach the server — the save will decide

const GREEN = '#5DCAA5';
const RED = '#E5484D';

interface Props {
  mode: 'setup' | 'edit';
  onClose?: () => void; // edit mode: Cancel / after Save
}

const ChooseUsernameScreen: React.FC<Props> = ({ mode, onClose }) => {
  const insets = useSafeAreaInsets();
  const { profile, setProfile } = useProfile();
  const [username, setUsername] = useState(profile?.username ?? '');
  const [name, setName] = useState(profile?.displayName ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [status, setStatus] = useState<Status>(profile?.username ? { kind: 'ok' } : { kind: 'idle' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const latest = useRef(username);
  const nameInput = useRef<TextInput>(null);
  const bioInput = useRef<TextInput>(null);
  const { changePhoto, busy: photoBusy } = useProfilePhoto();

  // Live check: rules locally right away, availability from the server after a pause.
  useEffect(() => {
    latest.current = username;
    setSaveError(null);
    if (!username) return setStatus({ kind: 'idle' });
    const problem = usernameProblem(username);
    if (problem) return setStatus({ kind: 'bad', reason: problem });
    if (username === profile?.username) return setStatus({ kind: 'ok' });
    setStatus({ kind: 'checking' });
    const t = setTimeout(() => {
      checkUsername(username)
        .then(r => {
          if (latest.current !== username) return;
          setStatus(r.available ? { kind: 'ok' } : { kind: 'bad', reason: r.problem ?? 'That username is taken' });
        })
        .catch(() => latest.current === username && setStatus({ kind: 'unknown' }));
    }, 350);
    return () => clearTimeout(t);
  }, [username, profile?.username]);

  const canSave = !saving && (status.kind === 'ok' || status.kind === 'unknown');

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const next = await saveMyProfile(mode === 'edit' ? { username, displayName: name, bio } : { username, displayName: name });
      setProfile(next); // setup: needsUsername is now false, so the app moves on
      onClose?.();
    } catch (e: any) {
      setSaveError(e.message);
      if (/taken/i.test(e.message)) setStatus({ kind: 'bad', reason: e.message });
    } finally {
      setSaving(false);
    }
  };

  const check =
    saveError && !/taken/i.test(saveError) ? { text: saveError, color: RED } :
    status.kind === 'ok' ? { text: '✓ Available', color: GREEN } :
    status.kind === 'bad' ? { text: `✗ ${status.reason}`, color: RED } :
    status.kind === 'checking' ? { text: 'Checking…', color: '#8A8A8A' } :
    status.kind === 'unknown' ? { text: "Couldn't check. It'll be checked when you save.", color: '#8A8A8A' } :
    { text: ' ', color: '#8A8A8A' };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {mode === 'edit' ? (
        <View style={[styles.nav, { paddingTop: insets.top }]}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.navSide}>
            <Text style={styles.navCancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.navTitle}>Edit profile</Text>
          <View style={styles.navSide} />
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: mode === 'setup' ? insets.top + 28 : 24, paddingBottom: insets.bottom + 20 }]}
        keyboardShouldPersistTaps="handled"
      >
        {mode === 'setup' ? (
          <>
            <View style={styles.mark}><Text style={styles.markText}>M</Text></View>
            <Text style={styles.title}>Choose your username</Text>
            <Text style={styles.sub}>This is how people will find you on Mercia. You can change it later.</Text>
          </>
        ) : (
          <Pressable onPress={changePhoto} style={styles.photo} accessibilityRole="button" accessibilityLabel="Change profile photo">
            <View>
              <Avatar person={profile ? { ...profile, displayName: name || profile.displayName } : null} size={88} />
              {photoBusy ? <View style={styles.photoBusy}><ActivityIndicator color="#FFFFFF" /></View> : null}
            </View>
            <Text style={styles.photoLink}>{profile?.avatarUrl ? 'Change photo' : 'Add photo'}</Text>
          </Pressable>
        )}

        <Text style={styles.label}>USERNAME</Text>
        <View style={[styles.field, status.kind === 'ok' && styles.fieldOk, status.kind === 'bad' && styles.fieldBad]}>
          <Text style={styles.at}>@</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={t => setUsername(normalizeUsername(t).replace(/\s/g, ''))}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="username-new"
            textContentType="username"
            maxLength={USERNAME_MAX + 5}
            placeholder="username"
            placeholderTextColor="#555"
            returnKeyType="next"
            onSubmitEditing={() => nameInput.current?.focus()}
            blurOnSubmit={false}
            accessibilityLabel="Username"
          />
          {status.kind === 'checking' ? <ActivityIndicator size="small" color="#777" /> : null}
        </View>
        <Text style={[styles.check, { color: check.color }]}>{check.text}</Text>
        <Text style={styles.hint}>3–20 characters: letters, numbers, _ and .</Text>

        <Text style={[styles.label, { marginTop: 24 }]}>
          NAME <Text style={styles.optional}>· optional</Text>
        </Text>
        <View style={styles.field}>
          <TextInput
            ref={nameInput}
            style={styles.input}
            value={name}
            onChangeText={setName}
            maxLength={DISPLAY_NAME_MAX}
            placeholder="Your name"
            placeholderTextColor="#555"
            autoComplete="name"
            textContentType="name"
            returnKeyType={mode === 'edit' ? 'next' : 'done'}
            onSubmitEditing={mode === 'edit' ? () => bioInput.current?.focus() : save}
            blurOnSubmit={mode !== 'edit'}
            accessibilityLabel="Name"
          />
        </View>

        {mode === 'edit' ? (
          <>
            <View style={styles.bioLabelRow}>
              <Text style={[styles.label, { marginTop: 24, marginBottom: 0 }]}>
                BIO <Text style={styles.optional}>· optional</Text>
              </Text>
              <Text style={[styles.counter, Array.from(bio).length > BIO_MAX - 15 && { color: '#E5A54D' }]}>
                {Array.from(bio).length}/{BIO_MAX}
              </Text>
            </View>
            <View style={[styles.field, styles.bioField]}>
              <TextInput
                ref={bioInput}
                style={[styles.input, styles.bioInput]}
                value={bio}
                onChangeText={t => setBio(t.split('\n').slice(0, BIO_MAX_LINES).join('\n'))}
                maxLength={BIO_MAX}
                multiline
                placeholder="A line about you"
                placeholderTextColor="#555"
                accessibilityLabel="Bio"
              />
            </View>
          </>
        ) : null}

        <View style={{ flex: 1, minHeight: 28 }} />

        <Pressable
          onPress={save}
          disabled={!canSave}
          style={({ pressed }) => [styles.button, !canSave && styles.buttonOff, pressed && canSave && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          {saving ? <ActivityIndicator color="#0B1F18" /> : (
            <Text style={[styles.buttonText, !canSave && styles.buttonTextOff]}>{mode === 'setup' ? 'Continue' : 'Save'}</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D0D' },
  nav: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', paddingHorizontal: 16, paddingBottom: 12 },
  navSide: { width: 70 },
  navCancel: { color: '#FFFFFF', fontSize: 16 },
  navTitle: { flex: 1, textAlign: 'center', color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  content: { flexGrow: 1, paddingHorizontal: 20 },
  mark: {
    width: 54, height: 54, borderRadius: 13, backgroundColor: '#D9D4C7', alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  markText: { fontFamily: 'Palatino', fontWeight: '700', fontSize: 28, color: '#3A3326' },
  title: { fontFamily: 'Palatino', fontStyle: 'italic', fontWeight: '700', fontSize: 32, lineHeight: 38, color: '#F2F2F2' },
  sub: { color: '#8A8A8A', fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 24 },
  bioLabelRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 8 },
  counter: { color: '#666', fontSize: 12, fontVariant: ['tabular-nums'] },
  bioField: { height: undefined, minHeight: 96, alignItems: 'flex-start', paddingVertical: 12 },
  bioInput: { alignSelf: 'stretch', textAlignVertical: 'top', lineHeight: 22, minHeight: 72 },
  photo: { alignItems: 'center', gap: 10, marginBottom: 28 },
  photoBusy: { ...StyleSheet.absoluteFillObject, borderRadius: 44, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  photoLink: { color: GREEN, fontSize: 15, fontWeight: '600' },
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 1.1, color: '#777', marginBottom: 8 },
  optional: { color: '#555', fontWeight: '500', letterSpacing: 0 },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 4, height: 52, borderRadius: 14, paddingHorizontal: 14,
    backgroundColor: '#1B1B1B', borderWidth: 1.5, borderColor: '#2C2C2C',
  },
  fieldOk: { borderColor: 'rgba(93,202,165,0.55)' },
  fieldBad: { borderColor: 'rgba(229,72,77,0.6)' },
  at: { color: '#6E6E6E', fontSize: 17 },
  // Full field height: the whole row is tappable (and the frame can't collapse).
  input: { flex: 1, alignSelf: 'stretch', color: '#FFFFFF', fontSize: 17, paddingVertical: 0 },
  check: { fontSize: 13, fontWeight: '600', marginTop: 8, marginHorizontal: 2, minHeight: 18 },
  hint: { color: '#6F6F6F', fontSize: 12, marginTop: 6, marginHorizontal: 2 },
  button: { height: 52, borderRadius: 14, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  buttonOff: { backgroundColor: '#243029' },
  buttonText: { color: '#0B1F18', fontSize: 16, fontWeight: '700' },
  buttonTextOff: { color: '#5F7A6F' },
});

export default ChooseUsernameScreen;
