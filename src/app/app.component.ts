import { Component } from '@angular/core';

import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { HeaderComponent } from './components/header/header.component';
import { PreviewDialogComponent } from './components/preview-dialog/preview-dialog.component';
import { PreviewDialogService } from './services/preview-dialog.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, HeaderComponent, PreviewDialogComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  isSidebarOpen = false;
  isSidebarCollapsed = false;
  isStandalonePage = false;

  // Public for the template: the one report preview dialog, opened from wherever a preview is
  // requested (see PreviewDialogService) rather than from any one screen.
  constructor(private router: Router, readonly previewDialog: PreviewDialogService) {
    // Close sidebar on mobile when navigating
    this.isStandalonePage = this.isStandaloneUrl(this.router.url);
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.isSidebarOpen = false;
      this.isStandalonePage = this.isStandaloneUrl(event.urlAfterRedirects);
      // A preview belongs to the screen that opened it - leaving that screen (a sidebar link,
      // the browser's back button) should not leave the report hanging over the next one.
      this.previewDialog.close();
    });
  }

  // Customer-facing weblink pages (e.g. /w/:token) and print-only report pages render
  // full-page, without the ERP shell
  private isStandaloneUrl(url: string): boolean {
    return url.startsWith('/w/') || url.startsWith('/print/');
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  closeSidebar(): void {
    this.isSidebarOpen = false;
  }

  toggleSidebarCollapse(): void {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }
}
