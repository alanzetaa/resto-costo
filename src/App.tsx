import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute, SuperAdminRoute } from './components/auth/ProtectedRoute'
import { AppLayout } from './components/layout/AppLayout'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/auth/LoginPage'
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage'
import { DashboardPage } from './pages/DashboardPage'
import { ProductosPage } from './pages/ProductosPage'
import { MadresPage } from './pages/MadresPage'
import { MadreDetailPage } from './pages/MadreDetailPage'
import { RecetasPage } from './pages/RecetasPage'
import { RecetaDetailPage } from './pages/RecetaDetailPage'
import { RubrosPage } from './pages/RubrosPage'
import { ListasPrecioPage } from './pages/ListasPrecioPage'
import { ProveedoresPage } from './pages/ProveedoresPage'
import { ComprasPage } from './pages/ComprasPage'
import { StockPage } from './pages/StockPage'
import { StockDetailPage } from './pages/StockDetailPage'
import { ForensePage } from './pages/ForensePage'
import { DescuentosPage } from './pages/DescuentosPage'
import { AnalisisPage } from './pages/AnalisisPage'
import { HistorialPage } from './pages/HistorialPage'
import { AccesosPage } from './pages/AccesosPage'
import { PerfilPage } from './pages/PerfilPage'
import { NotAuthorizedPage } from './pages/NotAuthorizedPage'
import { NotFoundPage } from './pages/NotFoundPage'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/no-autorizado" element={<NotAuthorizedPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/productos" element={<ProductosPage />} />
            <Route path="/madres" element={<MadresPage />} />
            <Route path="/madres/:id" element={<MadreDetailPage />} />
            <Route path="/recetas" element={<RecetasPage />} />
            <Route path="/recetas/:id" element={<RecetaDetailPage />} />
            <Route path="/rubros" element={<RubrosPage />} />
            <Route path="/listas-precio" element={<ListasPrecioPage />} />
            <Route path="/proveedores" element={<ProveedoresPage />} />
            <Route path="/compras" element={<ComprasPage />} />
            <Route path="/stock" element={<StockPage />} />
            <Route path="/stock/:id" element={<StockDetailPage />} />
            <Route path="/stock/:id/forense" element={<ForensePage />} />
            <Route path="/descuentos" element={<DescuentosPage />} />
            <Route path="/analisis" element={<AnalisisPage />} />
            <Route path="/historial" element={<HistorialPage />} />
            <Route path="/perfil" element={<PerfilPage />} />

            <Route element={<SuperAdminRoute />}>
              <Route path="/accesos" element={<AccesosPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  )
}
