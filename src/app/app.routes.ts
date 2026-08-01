import { Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { PartyTypeComponent } from './components/party-type/party-type.component';
import { InvoiceListComponent } from './components/invoice-list/invoice-list.component';
import { InvoiceFormComponent } from './components/invoice-form/invoice-form.component';
import { LabelGeneratorComponent } from './components/label-generator/label-generator.component';
import { InvoiceWeblinkComponent } from './components/invoice-weblink/invoice-weblink.component';
import { WeblinkBrandingComponent } from './components/weblink-branding/weblink-branding.component';
import { PartyFormComponent } from './components/party-form/party-form.component';
import { LedgerReportComponent } from './components/ledger-report/ledger-report.component';
import { LedgerPreviewComponent } from './components/ledger-preview/ledger-preview.component';
import { InvoicePreviewComponent } from './components/invoice-preview/invoice-preview.component';

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
  // Party master create/edit screen has its own header bar (no ERP sidebar/header shell, see app.component.ts)
  { path: 'parties/new', component: PartyFormComponent },
  // Print-only report pages render full-page, no ERP shell (see app.component.ts)
  { path: 'print/ledger', component: LedgerReportComponent },
  // Responsive preview: embeds print/ledger in a scaled iframe so it fits any screen width
  { path: 'print/ledger-preview', component: LedgerPreviewComponent },
  // Invoice layout (A4/A5) - the report itself is a static file (public/print/invoice/view/),
  // this route is only the responsive scaled-iframe wrapper around it, same pattern as above.
  { path: 'print/invoice-preview', component: InvoicePreviewComponent },
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: '**', redirectTo: '/dashboard' }
];
