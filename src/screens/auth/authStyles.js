import { StyleSheet } from 'react-native';
import { COLORS } from '../../theme/colors';

export const authStyles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 16,
    backgroundColor: COLORS.bg,
  },
  title: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 22,
    color: COLORS.text,
    marginBottom: 6,
  },
  caption: {
    fontFamily: 'Manrope_400Regular',
    color: COLORS.subtext,
  },
  input: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    fontFamily: 'Manrope_400Regular',
    color: COLORS.text,
    backgroundColor: COLORS.bg,
  },
  primaryButton: {
    marginTop: 14,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
  },
  linkText: {
    color: COLORS.primary,
    fontFamily: 'Manrope_600SemiBold',
  },
  webNotice: {
    marginTop: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#f7f7f7',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.divider,
  },
  contactName: {
    flex: 1,
    fontFamily: 'Manrope_600SemiBold',
    color: COLORS.text,
  },
  contactNumbers: {
    flex: 1,
    textAlign: 'right',
    fontFamily: 'Manrope_400Regular',
    color: COLORS.subtext,
    fontSize: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxOn: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
});
