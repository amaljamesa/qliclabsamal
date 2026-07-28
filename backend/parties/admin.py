from django.contrib import admin

from .models import Party


@admin.register(Party)
class PartyAdmin(admin.ModelAdmin):
    list_display = ('name', 'gstin', 'branch', 'active', 'created_at')
    search_fields = ('name', 'gstin', 'pan', 'email')
