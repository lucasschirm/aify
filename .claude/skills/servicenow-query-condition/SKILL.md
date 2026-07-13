---
name: servicenow-encoded-query
description: Creates complex ServiceNow encoded query strings with OR conditions and dot-walking to related tables. Helps build queries for filters, list views, and URL parameters using ServiceNow's encoded query syntax.
---

# ServiceNow Encoded Query Builder

This skill helps you create complex ServiceNow encoded query strings with OR conditions and dot-walking to related tables. These queries are used in ServiceNow filters, list views, URL parameters, and reference qualifiers.

## Query Syntax Basics

ServiceNow encoded queries use a specific syntax:
- Fields are referenced by their technical names
- Conditions are joined with `^` (AND) or `^OR` (OR)
- Values are represented in their database format

## Basic Query Components

### Simple Field Conditions
```
field=value          // Equals
field!=value         // Not equals
fieldISNOTEMPTY      // Is not empty
fieldISEMPTY         // Is empty
fieldLIKEvalue       // Contains value
fieldSTARTSWITHvalue // Starts with value
fieldENDSWITHvalue   // Ends with value
```

### Multiple Conditions

#### AND Conditions (using ^)
```
active=true^category=network
```

#### OR Conditions (using ^OR)
```
priority=1^ORpriority=2
```

#### Complex OR with Multiple Fields
```
category=network^ORcategory=database^ORcategory=storage
```

## Dot-Walking to Related Tables

Dot-walking allows you to reference fields in related tables:
```
incident.assigned_to.company
incident.caller_id.roles
incident.assignment_group.manager.name
```

### Examples of Dot-Walking Queries

#### Simple dot-walking query:
```
assigned_to.roles=itil
```

#### Complex dot-walking with AND conditions:
```
incident.assigned_to.roles=itil^category=network
```

#### Complex query with OR and dot-walking:
```
incident.assigned_to.roles=itil^ORincident.assigned_to.roles=admin
```

## Advanced Query Patterns

### Using IN operator for multiple values:
```
categoryINnetwork,database,storage
```

### Using LIKE with wildcards:
```
short_descriptionLIKE%outage%
```

### Date-based queries:
```
opened_atBETWEENjavascript:gs.daysAgoStart(7)@javascript:gs.daysAgoEnd(0)
```

### Complex OR conditions:
```
priority=1^ORpriority=2^ORpriority=3
```

### Combining dot-walking with OR:
```
incident.assigned_to.company=Acme^ORincident.assigned_to.company=Global
```

## Complete Examples

### Example 1: Find incidents assigned to ITIL users OR with high priority
```
assigned_to.roles=itil^ORpriority=1
```

### Example 2: Find incidents where assigned user's company is Acme OR Global
```
incident.assigned_to.company=Acme^ORincident.assigned_to.company=Global
```

### Example 3: Find incidents where caller has ITIL role OR description contains outage
```
incident.caller_id.roles=itil^ORincident.descriptionLIKE%outage%
```

### Example 4: Find incidents where assigned group's manager is John Smith
```
incident.assignment_group.manager.name=John Smith
```

### Example 5: Complex query with multiple OR conditions and dot-walking
```
incident.assigned_to.roles=itil^ORincident.assigned_to.roles=admin^ORincident.assigned_to.company=Acme
```

## Best Practices

1. **Use proper field names**: Use the technical names of fields, not labels
2. **Limit dot-walking depth**: Keep chains to 3 levels maximum
3. **Use appropriate operators**: Choose the right operator for your use case:
   - `=` for exact matches
   - `!=` for not equals
   - `LIKE` for partial matching with wildcards
   - `IN` for multiple values
   - `BETWEEN` for ranges

## Common Use Cases

### For URL Parameters:
```
https://instance.service-now.com/nav/ui/classic/filter/IncidentList?sysparm_query=active=true^ORpriority=1
```

### For Reference Qualifiers:
```
roles=itil^ORroles=admin
```

### For List Filters:
```
category=network^ORcategory=database^ORcategory=storage
```

### For Scripted Conditions:
```
javascript:'active=true^' + getGroupQualifier()
```

## Query Construction Guidelines

1. **Start with simple conditions** and build complexity
2. **Use `^` for AND logic** between conditions
3. **Use `^OR` for OR logic** between conditions
4. **Include proper field names** in technical format
5. **Use dot-walking syntax** when referencing related tables:
   ```
   table.field.subfield
   ```

## Available Operators

### String operators:
- `=` (equals)
- `!=` (not equals)
- `ISEMPTY` (is empty)
- `ISNOTEMPTY` (is not empty)
- `LIKE` (contains)
- `STARTSWITH` (starts with)
- `ENDSWITH` (ends with)
- `NOT LIKE` (does not contain)

### Numeric operators:
- `=` (equals)
- `!=` (not equals)
- `>` (greater than)
- `<` (less than)
- `>=` (greater than or equal)
- `<=` (less than or equal)
- `BETWEEN` (range)
- `IN` (multiple values)

### Reference field operators:
- `=` (equals)
- `!=` (not equals)
- `ISEMPTY` (is empty)
- `ISNOTEMPTY` (is not empty)
- `LIKE` (contains)
- `STARTSWITH` (starts with)
- `ENDSWITH` (ends with)

## Tips for Complex Queries

1. **Break down complex conditions** into smaller parts
2. **Use parentheses** when grouping conditions (in some contexts)
3. **Test queries in the list filter** before using in URLs or scripts
4. **Use the query builder** in ServiceNow to generate proper syntax
5. **Validate field names** by checking the table schema

## Common Field Name Patterns

- `active` (boolean)
- `priority` (choice field)
- `category` (choice field)
- `assigned_to` (reference field)
- `caller_id` (reference field)
- `short_description` (string field)
- `opened_at` (date/time field)

## Testing Your Queries

To verify your encoded queries:
1. Go to a ServiceNow list view
2. Apply your query in the filter field
3. Check that it returns the expected results
4. Adjust as needed based on the actual data

This skill provides the foundation for creating encoded queries in ServiceNow, but always validate your queries with actual data to ensure they return the expected results.