import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { Alert } from 'react-native';
export function useModuleRefresh(load: () => Promise<void>, error: () => string | null): void {
  const errorRef = useRef(error);
  errorRef.current = error;
  useFocusEffect(useCallback(() => {
    let active = true;
    void load().then(() => { const message=errorRef.current(); if(active&&message) Alert.alert('No se pudo cargar',message); })
      .catch(cause=>{ if(active) Alert.alert('No se pudo cargar',cause instanceof Error?cause.message:'Inténtalo nuevamente.'); });
    return ()=>{active=false;};
  },[load]));
}
