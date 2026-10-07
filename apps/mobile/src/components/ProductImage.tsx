import React, { useState } from 'react';
import { Linking, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../theme';

interface ProductImageProps {
  uri?: string | null | undefined;
  name: string;
  size?: number;
  large?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Una misma referencia de API para Web y Android; nunca construye URLs por SKU. */
export function ProductImage({ uri, name, size = 60, large = false, style }: ProductImageProps) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const hasImage = !!uri && failedUri !== uri;
  return (
    <>
    <View style={[styles.frame, { width: size, height: size }, style]}>
      {hasImage ? (
        <Image source={{ uri }} style={styles.image} contentFit="contain" cachePolicy="memory-disk"
          accessibilityLabel={`Fotografía de ${name}`} onError={() => setFailedUri(uri ?? null)} />
      ) : (
        <View style={styles.placeholder} accessible accessibilityLabel={`${name}: sin fotografía disponible`}>
          <Ionicons name="gift-outline" size={large ? 64 : Math.min(32, size / 2)} color={colors.primary[600]} />
          {large && <Text style={styles.caption}>Dulcería ERP-SC</Text>}
        </View>
      )}
    </View>
    {large && hasImage && uri?.startsWith('https://erp-sc-web.onrender.com/product-images/') && (
      <Text accessibilityRole="link" style={styles.credit}
        onPress={() => { void Linking.openURL('https://erp-sc-web.onrender.com/product-images/credits.html'); }}>
        Créditos de las fotografías
      </Text>
    )}
    </>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', flexShrink: 0, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.neutral[200] },
  image: { width: '100%', height: '100%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  caption: { marginTop: 12, color: colors.neutral[500], fontSize: 14 },
  credit: { marginTop: 8, color: colors.primary[600], fontSize: 12, textDecorationLine: 'underline', paddingVertical: 10 },
});
