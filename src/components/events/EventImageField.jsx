import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from '../Typography';
import { absoluteUrl } from '../../api/client';
import { eventsService } from '../../services/eventsService';
import { MAX_UPLOAD_BYTES, prepareProfilePhoto, tooLargeMessage } from '../../utils/imageUpload';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../../constants/theme';

/**
 * Event image: pick a photo, preview it, or remove it — the mobile port of the
 * web's file-input + preview control, using the OS photo library instead of a
 * hidden `<input type="file">`.
 *
 * `value` is whatever sits in `event.image`: an uploaded URL, a pasted URL, a
 * data URI (how older events were saved), or empty. Picking resizes the photo
 * client-side (the same `prepareProfilePhoto` the avatar upload uses) so a
 * phone photo lands well under the 2 MB limit, POSTs it to /event-image, and
 * reports the returned URL up via `onChange`. Remove clears the field; the
 * stored file, if any, is left as a harmless orphan rather than deleted out
 * from under a not-yet-saved event.
 */
export default function EventImageField({ value, onChange, disabled }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const src = absoluteUrl(value);

  const pick = async () => {
    if (busy || disabled) return;
    setError(null);
    const res = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 });
    if (res.didCancel) return;
    if (res.errorCode) {
      setError(res.errorMessage || 'Could not open your photos.');
      return;
    }
    const asset = res.assets?.[0];
    if (!asset?.uri) return;

    setBusy(true);
    try {
      const prepared = await prepareProfilePhoto({
        uri: asset.uri,
        name: asset.fileName || 'event.jpg',
        type: asset.type || 'image/jpeg',
        size: asset.fileSize,
      });
      if (prepared.size && prepared.size > MAX_UPLOAD_BYTES) {
        setError(tooLargeMessage(prepared));
        return;
      }
      const uploaded = await eventsService.uploadEventImage(prepared);
      const url = uploaded?.image_url;
      if (!url) throw new Error('Upload did not return an image URL.');
      onChange(url);
    } catch (err) {
      setError(err?.message ?? 'Could not upload the image. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Text style={styles.label}>Image</Text>

      {src ? (
        <View style={styles.row}>
          <View style={styles.preview}>
            <Image source={{ uri: src }} style={styles.previewImage} resizeMode="contain" />
          </View>
          <View style={styles.actions}>
            <Pressable
              onPress={pick}
              disabled={disabled || busy}
              style={({ pressed }) => [
                styles.actionBtn,
                pressed && !(disabled || busy) && styles.actionBtnPressed,
                (disabled || busy) && styles.disabled,
              ]}
            >
              {busy ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <MaterialCommunityIcons name="image-plus" size={space(3.5)} color={COLORS.primary} />
              )}
              <Text style={styles.actionText}>{busy ? 'Uploading…' : 'Replace'}</Text>
            </Pressable>
            <Pressable
              onPress={() => { setError(null); onChange(''); }}
              disabled={disabled || busy}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.dangerBtn,
                pressed && !(disabled || busy) && styles.dangerBtnPressed,
                (disabled || busy) && styles.disabled,
              ]}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={space(3.5)} color={COLORS.dangerFg} />
              <Text style={styles.dangerText}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={pick}
          disabled={disabled || busy}
          style={({ pressed }) => [
            styles.dropzone,
            pressed && !(disabled || busy) && styles.dropzonePressed,
            (disabled || busy) && styles.disabled,
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <MaterialCommunityIcons name="image-plus" size={space(4.5)} color={COLORS.primary} />
          )}
          <Text style={styles.actionText}>{busy ? 'Uploading…' : 'Upload image'}</Text>
        </Pressable>
      )}

      <Text style={error ? styles.errorHint : styles.hint}>
        {error || 'JPEG, PNG or WEBP. Large photos are resized automatically.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: space(1.5),
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space(3) },
  preview: {
    width: space(24),
    height: space(24),
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.bg,
  },
  previewImage: { width: '100%', height: '100%' },
  actions: { flexDirection: 'column', gap: space(2) },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(1.5),
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineStrong,
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
  },
  actionBtnPressed: { backgroundColor: COLORS.primary50 },
  actionText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold, color: COLORS.primary },
  dangerBtn: { borderColor: 'rgba(185,28,28,0.3)' },
  dangerBtnPressed: { backgroundColor: COLORS.dangerBg },
  dangerText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold, color: COLORS.dangerFg },
  dropzone: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2),
    borderRadius: RADII.card,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: COLORS.lineStrong,
    paddingVertical: space(6),
  },
  dropzonePressed: { backgroundColor: COLORS.primary50 },
  disabled: { opacity: 0.5 },
  hint: { marginTop: space(1), fontSize: TEXT.xs, color: COLORS.textMuted },
  errorHint: {
    marginTop: space(1),
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.medium,
    color: COLORS.dangerFg,
  },
});
