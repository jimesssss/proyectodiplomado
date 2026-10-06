import { useEffect } from 'react';
import { businessApi, type ApiParty, type ApiAccount } from '../../../services/business-api';
import { listWarehouses, type ApiOrgUnit } from '../../../services/organization-api';
import { createPosOrder, completePosOrder, COMPLETE_ORDER_PERMISSIONS } from '../../../services/pos-api';
import { useAuthStore } from '../../../stores/authStore';
import { useInventoryStore } from '../../../stores/inventoryStore';
/**
 * POS — Punto de Venta
 *
 * Usa los productos reales de productStore.
 * El carrito se administra con posStore.
 * Las ventas confirmadas se registran en salesStore.
 */

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, typography, radii } from '../../../theme';
import { usePOSStore, Product } from '../../../stores/posStore';
import { useProductStore } from '../../../stores/productStore';
import { useSalesStore } from '../../../stores/salesStore';

type PaymentMethod = 'cash' | 'card' | 'transfer';

export default function POSScreen() {
  const searchInputRef = useRef<TextInput>(null);

  const {
    cart,
    addToCart: addToCartInStore,
    removeFromCart: removeFromCartInStore,
    updateQuantity: updateQuantityInStore,
    clearCart,
    getCartTotal,
    getCartCount,
  } = usePOSStore();

  const { products: storeProducts } = useProductStore();
  const [customers,setCustomers]=useState<ApiParty[]>([]);
  const [warehouses,setWarehouses]=useState<ApiOrgUnit[]>([]);
  const [accounts,setAccounts]=useState<ApiAccount[]>([]);
  const [customerId,setCustomerId]=useState('');
  const [warehouseId,setWarehouseId]=useState('');
  const [accountId,setAccountId]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const pendingOrderId=useRef<string|null>(null);
  const submitLock=useRef(false);
  const blocked=()=>{if(pendingOrderId.current||submitLock.current){Alert.alert('Pedido pendiente','Confirma el resultado del pedido antes de cambiar el carrito.');return true;}return false;};
  const addToCart=(product:Product)=>{if(!blocked())addToCartInStore(product);};
  const removeFromCart=(id:string)=>{if(!blocked())removeFromCartInStore(id);};
  const updateQuantity=(id:string,quantity:number)=>{if(!blocked())updateQuantityInStore(id,quantity);};
  const stockBalances=useInventoryStore(state=>state.stockBalances);
  useEffect(()=>{
    void (async()=>{
      try {
        await useProductStore.getState().loadProducts();
        await useInventoryStore.getState().loadStock();
        const [people,storage,money]=await Promise.all([businessApi.listCustomers(),listWarehouses(),businessApi.listAccounts()]);
        setCustomers(people.filter(c=>!c.archived));setWarehouses(storage.filter(w=>w.status==='active'));setAccounts(money.filter(a=>!a.archived&&a.currency==='MXN'));
      }catch(error){Alert.alert('No se pudo cargar POS',error instanceof Error?error.message:'Inténtalo nuevamente.');}
    })();
  },[]);

  // Convertir productos del productStore al formato del POS
  const products: Product[] = storeProducts
    .filter((product) => product.status === 'active')
    .map((product) => ({
      id: product.id,
      name: product.name,
      price: product.salePrice,
      stock: warehouseId ? stockBalances.filter(b=>b.productId===product.id&&b.warehouseId===warehouseId).reduce((sum,b)=>sum+b.qty,0) : product.stock,
      category: product.category,
    }));

  const [searchQuery, setSearchQuery] = useState('');
  const [showCart, setShowCart] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  const [selectedPayment, setSelectedPayment] =
    useState<PaymentMethod>('cash');

  const [discount, setDiscount] = useState('');

  const [showResult, setShowResult] = useState(false);

  const [saleResult, setSaleResult] = useState({
    folio: '',
    total: 0,
    date: '',
  });

  // Buscar por nombre o categoría
  const filteredProducts = products.filter((product) => {
    const query = searchQuery.trim().toLowerCase();

    return (
      product.name.toLowerCase().includes(query) ||
      product.category.toLowerCase().includes(query)
    );
  });

  const cartTotal = getCartTotal();
  const cartCount = getCartCount();

  const parsedDiscount = parseFloat(discount);

  const discountValue =
    Number.isFinite(parsedDiscount) && parsedDiscount > 0
      ? parsedDiscount
      : 0;

  const finalTotal = Math.max(0, cartTotal - discountValue);

  const formatCurrency = (value: number) => {
    return `$${value.toFixed(2)}`;
  };

  // Agregar producto respetando el stock
  const handleAddToCart = (product: Product) => {
    if (product.stock <= 0) {
      return;
    }

    const existingItem = cart.find(
      (item) => item.product.id === product.id
    );

    if (
      existingItem &&
      existingItem.quantity >= product.stock
    ) {
      return;
    }

    addToCart(product);
  };

  // Aumentar cantidad
  const handleIncreaseQuantity = (
    product: Product,
    currentQuantity: number
  ) => {
    if (currentQuantity >= product.stock) {
      return;
    }

    updateQuantity(product.id, currentQuantity + 1);
  };

  // Disminuir cantidad
  const handleDecreaseQuantity = (
    productId: string,
    currentQuantity: number
  ) => {
    updateQuantity(productId, currentQuantity - 1);
  };

  // Retain the same order on a failed response, so an uncertain result cannot charge twice.
  const handleCompleteSale = async () => {
    if(submitLock.current||!cart.length)return;
    if(!customerId||!warehouseId||!accountId){Alert.alert('Datos requeridos','Selecciona cliente, almacén y cuenta de cobro.');return;}
    if(!COMPLETE_ORDER_PERMISSIONS.every(p=>useAuthStore.getState().can(p))){Alert.alert('Sin permiso','Tu usuario no tiene todos los permisos del flujo de venta.');return;}
    const account=accounts.find(a=>a.id===accountId);
    if(!account||account.type!==(selectedPayment==='cash'?'cash':'bank')){Alert.alert('Cuenta requerida','Selecciona una cuenta compatible con el método de pago.');return;}
    if(discountValue>cartTotal){Alert.alert('Descuento inválido','El descuento no puede superar el subtotal.');return;}
    submitLock.current=true;setSubmitting(true);
    try {
      if(!pendingOrderId.current) {
        const pct=cartTotal>0?discountValue/cartTotal*100:0;
        const order=await createPosOrder(customerId,cart.map(item=>({productId:item.product.id,description:item.product.name,
          quantity:item.quantity,unitPrice:item.product.price,taxRate:0,discountPct:pct})),selectedPayment);
        pendingOrderId.current=order.id;
      }
      const invoice=await completePosOrder(pendingOrderId.current,warehouseId,accountId);
      setSaleResult({folio:invoice.number,total:invoice.total,date:new Date(invoice.issueDate).toLocaleString('es-MX')});
      pendingOrderId.current=null;clearCart();setShowCart(false);setShowPayment(false);setShowResult(true);
      await useProductStore.getState().loadProducts();await useInventoryStore.getState().loadStock();await useSalesStore.getState().load();
    }catch(error){Alert.alert('No se pudo confirmar', (error instanceof Error?error.message:'Inténtalo nuevamente.')+
      (pendingOrderId.current?' El pedido se conserva; vuelve a confirmar para consultar su resultado.':''));}
    finally{setSubmitting(false);submitLock.current=false;}
  };

  // Preparar nueva venta
  const handleNewSale = () => {
    setShowResult(false);
    setDiscount('');
    setSelectedPayment('cash');
    setSearchQuery('');
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Venta</Text>

        <View style={styles.headerActions}>
          <Pressable
            style={styles.searchButton}
            onPress={() => searchInputRef.current?.focus()}
          >
            <Ionicons
              name="search-outline"
              size={24}
              color={colors.neutral[800]}
            />
          </Pressable>

          <Pressable
            style={styles.cartButton}
            onPress={() => setShowCart(true)}
          >
            <Ionicons
              name="cart-outline"
              size={24}
              color={colors.neutral[800]}
            />

            {cartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>
                  {cartCount}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {/* Buscador */}
      <View style={styles.searchContainer}>
        <Ionicons
          name="search-outline"
          size={20}
          color={colors.neutral[400]}
          style={styles.searchIcon}
        />

        <TextInput
          ref={searchInputRef}
          style={styles.searchInput}
          placeholder="Buscar producto..."
          placeholderTextColor={colors.neutral[400]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />

        {searchQuery.length > 0 && (
          <Pressable
            style={styles.clearSearchButton}
            onPress={() => {
              setSearchQuery('');
              searchInputRef.current?.focus();
            }}
          >
            <Ionicons
              name="close-circle"
              size={20}
              color={colors.neutral[400]}
            />
          </Pressable>
        )}
      </View>

      {/* Productos */}
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.productsGrid}>
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onAddToCart={() => handleAddToCart(product)}
            />
          ))}
        </View>

        {filteredProducts.length === 0 && (
          <View style={styles.noProducts}>
            <Ionicons
              name="search-outline"
              size={48}
              color={colors.neutral[300]}
            />

            <Text style={styles.noProductsTitle}>
              No se encontraron productos
            </Text>

            <Text style={styles.noProductsText}>
              Intenta buscar con otro nombre o categoría.
            </Text>
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Carrito */}
      <Modal
        visible={showCart}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCart(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              Carrito de Compras
            </Text>

            <Pressable onPress={() => setShowCart(false)}>
              <Ionicons
                name="close-outline"
                size={28}
                color={colors.neutral[600]}
              />
            </Pressable>
          </View>

          <ScrollView
            style={styles.cartScrollView}
            showsVerticalScrollIndicator={false}
          >
            {cart.length === 0 ? (
              <View style={styles.emptyCart}>
                <Ionicons
                  name="cart-outline"
                  size={64}
                  color={colors.neutral[300]}
                />

                <Text style={styles.emptyCartText}>
                  El carrito está vacío
                </Text>
              </View>
            ) : (
              cart.map((item) => (
                <View
                  key={item.product.id}
                  style={styles.cartItem}
                >
                  <View style={styles.cartItemInfo}>
                    <Text
                      style={styles.cartItemName}
                      numberOfLines={2}
                    >
                      {item.product.name}
                    </Text>

                    <Text style={styles.cartItemPrice}>
                      {formatCurrency(item.product.price)}
                    </Text>

                    <Text style={styles.cartItemStock}>
                      Disponible: {item.product.stock}
                    </Text>
                  </View>

                  <View style={styles.quantityContainer}>
                    <Pressable
                      style={styles.quantityButton}
                      onPress={() =>
                        handleDecreaseQuantity(
                          item.product.id,
                          item.quantity
                        )
                      }
                    >
                      <Ionicons
                        name="remove-outline"
                        size={20}
                        color={colors.neutral[600]}
                      />
                    </Pressable>

                    <Text style={styles.quantityText}>
                      {item.quantity}
                    </Text>

                    <Pressable
                      style={[
                        styles.quantityButton,
                        item.quantity >= item.product.stock &&
                          styles.quantityButtonDisabled,
                      ]}
                      disabled={
                        item.quantity >= item.product.stock
                      }
                      onPress={() =>
                        handleIncreaseQuantity(
                          item.product,
                          item.quantity
                        )
                      }
                    >
                      <Ionicons
                        name="add-outline"
                        size={20}
                        color={
                          item.quantity >= item.product.stock
                            ? colors.neutral[300]
                            : colors.neutral[600]
                        }
                      />
                    </Pressable>
                  </View>

                  <Pressable
                    style={styles.removeButton}
                    onPress={() =>
                      removeFromCart(item.product.id)
                    }
                  >
                    <Ionicons
                      name="trash-outline"
                      size={20}
                      color={colors.error}
                    />
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>

          {cart.length > 0 && (
            <View style={styles.cartFooter}>
              <View style={styles.summaryContainer}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    Subtotal:
                  </Text>

                  <Text style={styles.summaryValue}>
                    {formatCurrency(cartTotal)}
                  </Text>
                </View>

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    Descuento:
                  </Text>

                  <TextInput
                    style={styles.discountInput}
                    placeholder="0.00"
                    placeholderTextColor={colors.neutral[400]}
                    editable={!pendingOrderId.current&&!submitting}
                    value={discount}
                    onChangeText={setDiscount}
                    keyboardType="decimal-pad"
                  />
                </View>

                <View
                  style={[
                    styles.summaryRow,
                    styles.totalRow,
                  ]}
                >
                  <Text style={styles.totalLabel}>
                    Total:
                  </Text>

                  <Text style={styles.totalValue}>
                    {formatCurrency(finalTotal)}
                  </Text>
                </View>
              </View>

              <Pressable
                style={styles.paymentButton}
                onPress={() => setShowPayment(true)}
              >
                <Text style={styles.paymentButtonText}>
                  Proceder al Pago
                </Text>
              </Pressable>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* Pago */}
      <Modal
        visible={showPayment}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPayment(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              Método de Pago
            </Text>

            <Pressable onPress={() => setShowPayment(false)}>
              <Ionicons
                name="close-outline"
                size={28}
                color={colors.neutral[600]}
              />
            </Pressable>
          </View>

          <View style={styles.paymentContent}>
            <Text style={styles.paymentTotal}>
              Total a pagar: {formatCurrency(finalTotal)}
            </Text>

            <Text style={styles.paymentMethodText}>Cliente</Text>
            <ScrollView horizontal>{customers.map(c=><Pressable key={c.id} disabled={submitting||!!pendingOrderId.current} style={[styles.paymentMethod,customerId===c.id&&styles.paymentMethodActive]} onPress={()=>setCustomerId(c.id)}><Text>{c.name}</Text></Pressable>)}</ScrollView>
            <Text style={styles.paymentMethodText}>Almacén</Text>
            <ScrollView horizontal>{warehouses.map(w=><Pressable key={w.id} disabled={submitting||!!pendingOrderId.current} style={[styles.paymentMethod,warehouseId===w.id&&styles.paymentMethodActive]} onPress={()=>setWarehouseId(w.id)}><Text>{w.name}</Text></Pressable>)}</ScrollView>
            <Text style={styles.paymentMethodText}>Cuenta de cobro (MXN)</Text>
            <ScrollView horizontal>{accounts.filter(a=>a.type===(selectedPayment==='cash'?'cash':'bank')).map(a=><Pressable key={a.id} disabled={submitting||!!pendingOrderId.current} style={[styles.paymentMethod,accountId===a.id&&styles.paymentMethodActive]} onPress={()=>setAccountId(a.id)}><Text>{a.name}</Text></Pressable>)}</ScrollView>
            <View style={styles.paymentMethods}>
              <Pressable
                style={[
                  styles.paymentMethod,
                  selectedPayment === 'cash' &&
                    styles.paymentMethodActive,
                ]}
                onPress={() => setSelectedPayment('cash')}
              >
                <Ionicons
                  name="cash-outline"
                  size={24}
                  color={
                    selectedPayment === 'cash'
                      ? colors.neutral[0]
                      : colors.neutral[600]
                  }
                />

                <Text
                  style={[
                    styles.paymentMethodText,
                    selectedPayment === 'cash' &&
                      styles.paymentMethodTextActive,
                  ]}
                >
                  Efectivo
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.paymentMethod,
                  selectedPayment === 'card' &&
                    styles.paymentMethodActive,
                ]}
                onPress={() => setSelectedPayment('card')}
              >
                <Ionicons
                  name="card-outline"
                  size={24}
                  color={
                    selectedPayment === 'card'
                      ? colors.neutral[0]
                      : colors.neutral[600]
                  }
                />

                <Text
                  style={[
                    styles.paymentMethodText,
                    selectedPayment === 'card' &&
                      styles.paymentMethodTextActive,
                  ]}
                >
                  Tarjeta
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.paymentMethod,
                  selectedPayment === 'transfer' &&
                    styles.paymentMethodActive,
                ]}
                onPress={() => setSelectedPayment('transfer')}
              >
                <Ionicons
                  name="swap-horizontal-outline"
                  size={24}
                  color={
                    selectedPayment === 'transfer'
                      ? colors.neutral[0]
                      : colors.neutral[600]
                  }
                />

                <Text
                  style={[
                    styles.paymentMethodText,
                    selectedPayment === 'transfer' &&
                      styles.paymentMethodTextActive,
                  ]}
                >
                  Transferencia
                </Text>
              </Pressable>
            </View>

            <Pressable
              style={styles.confirmButton}
              disabled={submitting}
              onPress={handleCompleteSale}
            >
              <Text style={styles.confirmButtonText}>
                {submitting ? 'Confirmando…' : 'Confirmar Venta'}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Venta realizada */}
      <Modal
        visible={showResult}
        animationType="fade"
        transparent
        onRequestClose={handleNewSale}
      >
        <View style={styles.resultOverlay}>
          <View style={styles.resultContainer}>
            <Ionicons
              name="checkmark-circle"
              size={64}
              color={colors.success}
            />

            <Text style={styles.resultTitle}>
              Venta Realizada
            </Text>

            <Text style={styles.resultFolio}>
              Folio: {saleResult.folio}
            </Text>

            <Text style={styles.resultTotal}>
              Total: {formatCurrency(saleResult.total)}
            </Text>

            <Text style={styles.resultDate}>
              {saleResult.date}
            </Text>

            <Pressable
              style={styles.resultButton}
              onPress={handleNewSale}
            >
              <Text style={styles.resultButtonText}>
                Nueva Venta
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ProductCard({
  product,
  onAddToCart,
}: {
  product: Product;
  onAddToCart: () => void;
}) {
  const outOfStock = product.stock <= 0;

  return (
    <View style={styles.productCard}>
      <View style={styles.productImagePlaceholder}>
        <Ionicons
          name="cube-outline"
          size={32}
          color={colors.neutral[400]}
        />
      </View>

      <Text
        style={styles.productName}
        numberOfLines={2}
      >
        {product.name}
      </Text>

      <Text style={styles.productPrice}>
        ${product.price.toFixed(2)}
      </Text>

      <Text
        style={[
          styles.productStock,
          outOfStock && styles.productStockEmpty,
        ]}
      >
        {outOfStock
          ? 'Agotado'
          : `Disponible: ${product.stock}`}
      </Text>

      <Pressable
        style={[
          styles.addButton,
          outOfStock && styles.addButtonDisabled,
        ]}
        disabled={outOfStock}
        onPress={onAddToCart}
      >
        <Ionicons
          name="add-outline"
          size={20}
          color={
            outOfStock
              ? colors.neutral[400]
              : colors.neutral[0]
          }
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },

  title: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.neutral[800],
  },

  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },

  searchButton: {
    padding: spacing.sm,
  },

  cartButton: {
    position: 'relative',
    padding: spacing.sm,
  },

  cartBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: colors.error,
    borderRadius: radii.full,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },

  cartBadgeText: {
    color: colors.neutral[0],
    fontSize: 10,
    fontWeight: typography.weight.bold,
  },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },

  searchIcon: {
    marginRight: spacing.sm,
  },

  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm + 4,
    fontSize: typography.size.base,
    color: colors.neutral[800],
  },

  clearSearchButton: {
    padding: spacing.xs,
  },

  scrollView: {
    flex: 1,
    marginTop: spacing.md,
  },

  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
  },

  productCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginHorizontal: '1%',
    marginBottom: spacing.md,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },

  productImagePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: radii.md,
    backgroundColor: colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },

  productName: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.neutral[800],
    textAlign: 'center',
    marginBottom: spacing.xs,
  },

  productPrice: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.bold,
    color: colors.primary[600],
    marginBottom: spacing.xs,
  },

  productStock: {
    fontSize: typography.size.xs,
    color: colors.neutral[500],
    marginBottom: spacing.sm,
  },

  productStockEmpty: {
    color: colors.error,
    fontWeight: typography.weight.medium,
  },

  addButton: {
    backgroundColor: colors.primary[600],
    width: 36,
    height: 36,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },

  addButtonDisabled: {
    backgroundColor: colors.neutral[200],
  },

  noProducts: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },

  noProductsTitle: {
    marginTop: spacing.md,
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[700],
    textAlign: 'center',
  },

  noProductsText: {
    marginTop: spacing.xs,
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    textAlign: 'center',
  },

  bottomSpacer: {
    height: spacing.xxl,
  },

  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },

  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },

  modalTitle: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.neutral[800],
  },

  cartScrollView: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },

  emptyCart: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },

  emptyCartText: {
    fontSize: typography.size.base,
    color: colors.neutral[500],
    marginTop: spacing.md,
  },

  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },

  cartItemInfo: {
    flex: 1,
  },

  cartItemName: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.neutral[800],
  },

  cartItemPrice: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: 2,
  },

  cartItemStock: {
    fontSize: typography.size.xs,
    color: colors.neutral[400],
    marginTop: 2,
  },

  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.sm,
  },

  quantityButton: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
  },

  quantityButtonDisabled: {
    backgroundColor: colors.neutral[100],
    opacity: 0.5,
  },

  quantityText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.neutral[800],
    marginHorizontal: spacing.sm,
    minWidth: 24,
    textAlign: 'center',
  },

  removeButton: {
    padding: spacing.sm,
  },

  cartFooter: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[200],
    padding: spacing.lg,
  },

  summaryContainer: {
    marginBottom: spacing.md,
  },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },

  summaryLabel: {
    fontSize: typography.size.base,
    color: colors.neutral[600],
  },

  summaryValue: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.neutral[800],
  },

  discountInput: {
    borderWidth: 1,
    borderColor: colors.neutral[300],
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: typography.size.base,
    color: colors.neutral[800],
    minWidth: 80,
    textAlign: 'right',
  },

  totalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.neutral[200],
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },

  totalLabel: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[800],
  },

  totalValue: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.primary[600],
  },

  paymentButton: {
    backgroundColor: colors.primary[600],
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  paymentButtonText: {
    color: colors.neutral[0],
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
  },

  paymentContent: {
    padding: spacing.lg,
  },

  paymentTotal: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.neutral[800],
    textAlign: 'center',
    marginBottom: spacing.lg,
  },

  paymentMethods: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },

  paymentMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: colors.neutral[200],
  },

  paymentMethodActive: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },

  paymentMethodText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.neutral[800],
    marginLeft: spacing.md,
  },

  paymentMethodTextActive: {
    color: colors.neutral[0],
  },

  confirmButton: {
    backgroundColor: colors.success,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  confirmButtonText: {
    color: colors.neutral[0],
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
  },

  resultOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },

  resultContainer: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
  },

  resultTitle: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.neutral[800],
    marginTop: spacing.md,
  },

  resultFolio: {
    fontSize: typography.size.base,
    color: colors.neutral[600],
    marginTop: spacing.sm,
  },

  resultTotal: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.primary[600],
    marginTop: spacing.sm,
  },

  resultDate: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: spacing.xs,
  },

  resultButton: {
    backgroundColor: colors.primary[600],
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    marginTop: spacing.lg,
  },

  resultButtonText: {
    color: colors.neutral[0],
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
  },
});