import { Component, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';

import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent implements OnInit, OnDestroy {
  @Output() toggleSidebar = new EventEmitter<void>();

  isDashboard = true;
  currentTimeStr = '';
  private timerId: any;
  private routerSub!: Subscription;

  constructor(private router: Router) {
    this.updateTime();
  }

  ngOnInit(): void {
    // Determine if we are on dashboard to adjust header details
    this.isDashboard = this.router.url === '/dashboard' || this.router.url === '/';
    this.routerSub = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.isDashboard = event.urlAfterRedirects === '/dashboard' || event.urlAfterRedirects === '/';
    });

    this.timerId = setInterval(() => this.updateTime(), 60000);
  }

  ngOnDestroy(): void {
    if (this.timerId) clearInterval(this.timerId);
    if (this.routerSub) this.routerSub.unsubscribe();
  }

  updateTime(): void {
    const now = new Date();
    // Format like DD-MM-YYYY HH:mm
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    this.currentTimeStr = `${day}-${month}-${year} ${hours}:${minutes}`;
  }

  onMenuClick(): void {
    this.toggleSidebar.emit();
  }
}
