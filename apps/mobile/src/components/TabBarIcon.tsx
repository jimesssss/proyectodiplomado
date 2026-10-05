/**
 * TabBarIcon — Iconos nativos para la barra de navegación
 *
 * Construidos con View y StyleSheet. Sin fuentes de iconos.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';

export type TabBarIconType = 'home' | 'pos' | 'products' | 'inventory' | 'more';

interface TabBarIconProps {
  type: TabBarIconType;
  color: string;
  size?: number;
}

export function TabBarIcon({ type, color, size = 24 }: TabBarIconProps) {
  const iconSize = size;
  const iconColor = color;

  return (
    <View style={[styles.container, { width: iconSize, height: iconSize }]}>
      {type === 'home' && <HomeIcon color={iconColor} size={iconSize} />}
      {type === 'pos' && <POSIcon color={iconColor} size={iconSize} />}
      {type === 'products' && <ProductsIcon color={iconColor} size={iconSize} />}
      {type === 'inventory' && <InventoryIcon color={iconColor} size={iconSize} />}
      {type === 'more' && <MoreIcon color={iconColor} size={iconSize} />}
    </View>
  );
}

// ── Home Icon (casa) ─────────────────────────────────────────────────────
function HomeIcon({ color, size }: { color: string; size: number }) {
  const roofHeight = size * 0.4;
  const bodyHeight = size * 0.5;
  const bodyWidth = size * 0.7;

  return (
    <View style={styles.homeContainer}>
      {/* Techo triangular */}
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: size * 0.35,
          borderRightWidth: size * 0.35,
          borderBottomWidth: roofHeight,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
        }}
      />
      {/* Cuerpo */}
      <View
        style={{
          width: bodyWidth,
          height: bodyHeight,
          backgroundColor: color,
          marginTop: -1,
        }}
      />
    </View>
  );
}

// ── POS Icon (terminal/caja) ─────────────────────────────────────────────
function POSIcon({ color, size }: { color: string; size: number }) {
  return (
    <View style={styles.posContainer}>
      {/* Rectángulo exterior */}
      <View
        style={{
          width: size * 0.8,
          height: size * 0.6,
          borderWidth: 2,
          borderColor: color,
          borderRadius: 2,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {/* Línea interior */}
        <View
          style={{
            width: size * 0.4,
            height: 2,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  );
}

// ── Products Icon (caja/paquete) ─────────────────────────────────────────
function ProductsIcon({ color, size }: { color: string; size: number }) {
  return (
    <View style={styles.productsContainer}>
      {/* Caja */}
      <View
        style={{
          width: size * 0.7,
          height: size * 0.7,
          backgroundColor: color,
          borderRadius: 2,
        }}
      />
      {/* Línea superior (cinta) */}
      <View
        style={{
          position: 'absolute',
          top: size * 0.25,
          width: size * 0.7,
          height: 2,
          backgroundColor: '#fff',
        }}
      />
    </View>
  );
}

// ── Inventory Icon (cajas apiladas) ──────────────────────────────────────
function InventoryIcon({ color, size }: { color: string; size: number }) {
  return (
    <View style={styles.inventoryContainer}>
      {/* Caja inferior */}
      <View
        style={{
          width: size * 0.6,
          height: size * 0.35,
          backgroundColor: color,
          borderRadius: 1,
          marginBottom: 1,
        }}
      />
      {/* Caja superior */}
      <View
        style={{
          width: size * 0.45,
          height: size * 0.3,
          backgroundColor: color,
          borderRadius: 1,
        }}
      />
    </View>
  );
}

// ── More Icon (tres líneas) ──────────────────────────────────────────────
function MoreIcon({ color, size }: { color: string; size: number }) {
  return (
    <View style={styles.moreContainer}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            width: size * 0.7,
            height: 2,
            backgroundColor: color,
            marginVertical: 1.5,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  homeContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  posContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  productsContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  inventoryContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
