import { Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { PartyTypeComponent } from './components/party-type/party-type.component';
import { InvoiceListComponent } from './components/invoice-list/invoice-list.component';
import { InvoiceFormComponent } from './components/invoice-form/invoice-form.component';
import { LabelGeneratorComponent } from './components/label-generator/label-generator.component';
import { InvoiceWeblinkComponent } from './components/invoice-weblink/invoice-weblink.component';
import { WeblinkBrandingComponent } from './components/weblink-branding/weblink-branding.component';

export const routes: Routes = [
  { path: 'dashboard', component: DashboardComponent },
  { path: 'catalogue', component: PartyTypeComponent },
  { path: 'invoices', component: InvoiceListComponent },
  { path: 'invoices/new', component: InvoiceFormComponent },
  { path: 'invoices/edit/:id', component: InvoiceFormComponent },
  { path: 'label-generator', component: LabelGeneratorComponent },
  { path: 'settings/weblink-branding', component: WeblinkBrandingComponent },
  // Customer-facing secure invoice weblink (no ERP sidebar/header shell, see app.component.ts)
  { path: 'w/:token', component: InvoiceWeblinkComponent },
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: '**', redirectTo: '/dashboard' }
];
