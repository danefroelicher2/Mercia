import { useCallback, useState } from 'react';
import { ActionSheetIOS, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useProfile } from '../context/ProfileContext';
import { deleteAvatar, uploadAvatar } from '../services/profile';

// Change / remove your profile photo. Pick from the library, crop square in
// the iOS editor, shrink to 512×512 JPEG (~50–150 KB), upload. `onChanged`
// runs after a successful change so the screen can reload.

const SIZE = 512;

async function pickSquareJpeg(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (result.canceled || !result.assets?.length) return null;
  const { uri, width, height } = result.assets[0];

  const ctx = ImageManipulator.manipulate(uri);
  // The editor already crops square; if a photo still isn't, take its center.
  if (width && height && width !== height) {
    const side = Math.min(width, height);
    ctx.crop({ originX: (width - side) / 2, originY: (height - side) / 2, width: side, height: side });
  }
  ctx.resize({ width: SIZE, height: SIZE });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.75, base64: true });
  return saved.base64 ?? null;
}

export function useProfilePhoto(onChanged?: () => void) {
  const { profile, setProfile } = useProfile();
  const [busy, setBusy] = useState(false);

  // `busy` covers only the upload/removal, not the time spent in the picker.
  const save = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }, [onChanged]);

  const choose = useCallback(async () => {
    try {
      const base64 = await pickSquareJpeg();
      if (base64) await save(async () => setProfile(await uploadAvatar(base64)));
    } catch (e: any) {
      Alert.alert(e?.message || "Couldn't update your photo. Try again.");
    }
  }, [save, setProfile]);

  const remove = useCallback(async () => {
    try {
      await save(async () => setProfile(await deleteAvatar()));
    } catch (e: any) {
      Alert.alert(e?.message || "Couldn't remove your photo. Try again.");
    }
  }, [save, setProfile]);

  const changePhoto = useCallback(() => {
    if (busy) return;
    const hasPhoto = !!profile?.avatarUrl;
    const options = hasPhoto ? ['Choose from library', 'Remove photo', 'Cancel'] : ['Choose from library', 'Cancel'];
    ActionSheetIOS.showActionSheetWithOptions(
      { title: 'Profile photo', options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: hasPhoto ? 1 : undefined },
      i => {
        if (i === 0) choose();
        else if (hasPhoto && i === 1) remove();
      },
    );
  }, [busy, profile?.avatarUrl, choose, remove]);

  return { changePhoto, busy };
}
