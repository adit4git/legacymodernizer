using System.ComponentModel.DataAnnotations;

namespace ContosoStore.Api.Models;

public class Product
{
    public int Id { get; set; }

    [Required, StringLength(120)]
    public string Name { get; set; } = string.Empty;

    [StringLength(2000)]
    public string? Description { get; set; }

    [Range(0, 999999.99)]
    public decimal Price { get; set; }

    public int StockQuantity { get; set; }

    public string Category { get; set; } = "GENERAL";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public bool IsActive { get; set; } = true;
}
