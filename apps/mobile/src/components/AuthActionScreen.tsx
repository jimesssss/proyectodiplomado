import {useState} from 'react';
import {View,Text,ScrollView} from 'react-native';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {FormInput,PrimaryButton,ScreenContainer,SecondaryButton} from './index';
import {forgotPasswordWithApi,resendVerificationWithApi,resetPasswordWithApi,verifyEmailWithApi} from '../services/auth-api';
import {spacing,colors,radii} from '../theme';
export function AuthActionScreen({mode}:{mode:'forgot'|'reset'|'verify'|'resend'}){
 const router=useRouter(),params=useLocalSearchParams<{token?:string}>();
 const [email,setEmail]=useState(''),[token,setToken]=useState(typeof params.token==='string'?params.token:''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState<string|null>(null),[error,setError]=useState<string|null>(null);
 const title=mode==='forgot'?'Recuperar contraseña':mode==='reset'?'Restablecer contraseña':mode==='verify'?'Verificar correo':'Reenviar verificación';
 const submit=async()=>{
  if(busy)return;setError(null);setMessage(null);
  if((mode==='forgot'||mode==='resend')&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())){setError('Ingresa un correo válido.');return;}
  if((mode==='verify'||mode==='reset')&&!token.trim()){setError('Ingresa el token del enlace recibido.');return;}
  if(mode==='reset'&&(password.length<12||password.length>128||!/[A-Z]/.test(password)||!/[a-z]/.test(password)||!/[0-9]/.test(password)||password!==confirm)){setError('Usa 12 a 128 caracteres, mayúscula, minúscula y número, y confirma la contraseña.');return;}
  setBusy(true);try{
   if(mode==='forgot'){await forgotPasswordWithApi(email);setMessage('Si la cuenta existe, recibirás instrucciones por correo.');}
   if(mode==='resend'){await resendVerificationWithApi(email);setMessage('Si la cuenta requiere verificación, recibirás un enlace por correo.');}
   if(mode==='verify'){await verifyEmailWithApi(token.trim());setMessage('Correo verificado. Ya puedes iniciar sesión.');}
   if(mode==='reset'){await resetPasswordWithApi(token.trim(),password);setPassword('');setConfirm('');setMessage('Contraseña restablecida. Inicia sesión con la nueva contraseña.');}
  }catch(cause){setError(cause instanceof Error?cause.message:'No se pudo completar la solicitud.');}finally{setBusy(false);}
 };
 return <ScreenContainer><ScrollView contentContainerStyle={{padding:spacing.lg,width:'100%',maxWidth:520,alignSelf:'center'}}><Text style={{fontSize:13,fontWeight:'700',letterSpacing:1.5,color:colors.primary[700],marginBottom:spacing.md}}>ERP-SC · DULCERÍA</Text><Text style={{fontSize:26,fontWeight:'700',color:colors.neutral[900],marginBottom:spacing.lg}}>{title}</Text>
  {(mode==='forgot'||mode==='resend')?<FormInput label="Correo electrónico" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"/>:<FormInput label="Token del enlace" value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false}/>}
  {mode==='reset'&&<View><FormInput label="Nueva contraseña" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none"/><FormInput label="Confirmar contraseña" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none"/></View>}
  {error&&<Text accessibilityRole="alert" style={{color:colors.error,backgroundColor:'#FCECEF',padding:spacing.md,borderRadius:radii.md,marginBottom:spacing.md}}>{error}</Text>}{message&&<Text accessibilityLiveRegion="polite" style={{color:colors.success,backgroundColor:'#EAF5EF',padding:spacing.md,borderRadius:radii.md,marginBottom:spacing.md}}>{message}</Text>}
  <PrimaryButton title={title} onPress={()=>{void submit();}} loading={busy}/><SecondaryButton title="Iniciar sesión" onPress={()=>router.replace('/login')}/>
 </ScrollView></ScreenContainer>;
}
