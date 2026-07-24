import { Component } from '@angular/core';

import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { HeaderComponent } from './components/header/header.component';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, HeaderComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  isSidebarOpen = false;
  isSidebarCollapsed = false;
  isStandalonePage = false;

  constructor(private router: Router) {
    // Close sidebar on mobile when navigating
    this.isStandalonePage = this.isStandaloneUrl(this.router.url);
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.isSidebarOpen = false;
      this.isStandalonePage = this.isStandaloneUrl(event.urlAfterRedirects);
    });
  }

  // Customer-facing weblink pages (e.g. /w/:token) render full-page, without the ERP shell
  private isStandaloneUrl(url: string): boolean {
    return url.startsWith('/w/');
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
